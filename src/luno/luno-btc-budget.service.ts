import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type UpdateQueryBuilder } from 'typeorm';
import {
  calendarMonthKey,
  monthKeyFromBudgetDate,
  monthStartDate,
  summarizeMonthBuys,
} from './accounting/luno-btc-activity';
import {
  budgetDisplayState,
  budgetStatus,
  isStrategyMoneyReady,
  maxAllowedNewBtcSpendMyr,
  parseBudgetConfig,
  parsePositiveAmount,
  remainingBudgetMyr,
  type LunoBtcBudgetConfig,
  type LunoBtcBudgetDisplayState,
  type LunoBtcBudgetStatus,
} from './accounting/luno-btc-budget';
import { roundBtc, roundMyr } from './accounting/luno-btc-formulas';
import type { AccountingReadiness } from './accounting/luno-btc.types';
import type {
  AllocateLunoBtcMoneyBucketDto,
  UpsertLunoBtcBudgetDto,
} from './dto/luno-btc-budget.dto';
import { LunoBtcMoneyBucket } from './entities/luno-btc-money-bucket.entity';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import { addDecimalStrings, compareDecimal } from './luno-decimal';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoHealthService } from './luno-health.service';

export type LunoBtcBudgetSuggestion = {
  month: string;
  monthlyBudgetMyr: string;
  normalBuyAllocationMyr: string | null;
  dipReserveAllocationMyr: string | null;
};

export type LunoBtcBudgetView = {
  month: string;
  confirmed: boolean;
  monthlyBudgetMyr: string | null;
  usedMyr: string;
  remainingMyr: string | null;
  maxAllowedNewSpendMyr: string;
  normalBuyAllocationMyr: string | null;
  dipReserveAllocationMyr: string | null;
  normalBuyUsedMyr: null;
  dipReserveUsedMyr: null;
  status: LunoBtcBudgetStatus;
  displayState: LunoBtcBudgetDisplayState;
  displayStateLabel: string;
  suggestedBudget: LunoBtcBudgetSuggestion | null;
  buyCount: number;
  btcReceived: string | null;
  latestBuyAt: string | null;
  lunoMyrAvailableMyr: string | null;
  protectedProfitMyr: string;
  reinvestmentReserveMyr: string;
};

export type LunoBtcBudgetHistoryRow = {
  month: string;
  budgetMyr: string;
  usedMyr: string;
  remainingMyr: string;
  status: LunoBtcBudgetStatus;
};

export type LunoBtcStrategyContext = {
  accountingStatus: AccountingReadiness;
  monthlyBudgetMyr: string | null;
  monthlyUsedMyr: string;
  monthlyRemainingMyr: string | null;
  maxAllowedNewSpendMyr: string;
  dipReserveAllocationMyr: string | null;
  lunoMyrAvailableMyr: string | null;
  strategyMoneyReady: boolean;
};

export type LunoBtcMoneyBucketsView = {
  protectedProfitMyr: string;
  reinvestmentReserveMyr: string;
  lunoMyrAvailableMyr: string | null;
};

@Injectable()
export class LunoBtcBudgetService {
  constructor(
    @InjectRepository(LunoBtcMonthlyBudget)
    private readonly budgets: Repository<LunoBtcMonthlyBudget>,
    @InjectRepository(LunoBtcMoneyBucket)
    private readonly buckets: Repository<LunoBtcMoneyBucket>,
    private readonly accounting: LunoBtcAccountingService,
    private readonly health: LunoHealthService,
  ) {}

  async getCurrentBudget(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcBudgetView> {
    const month = calendarMonthKey(now);
    return this.buildView(userId, month);
  }

  async upsertCurrentBudget(
    userId: string,
    input: UpsertLunoBtcBudgetDto,
    now = new Date(),
  ): Promise<LunoBtcBudgetView> {
    return this.writeCurrentBudget(userId, input, now, true);
  }

  async patchCurrentBudget(
    userId: string,
    input: UpsertLunoBtcBudgetDto,
    now = new Date(),
  ): Promise<LunoBtcBudgetView> {
    return this.writeCurrentBudget(userId, input, now, false);
  }

  private async writeCurrentBudget(
    userId: string,
    input: UpsertLunoBtcBudgetDto,
    now: Date,
    confirm: boolean,
  ): Promise<LunoBtcBudgetView> {
    const month = calendarMonthKey(now);
    const config = parseBudgetConfig(input);
    const budgetMonth = monthStartDate(month);
    for (let attempt = 1; attempt <= BUDGET_WRITE_ATTEMPTS; attempt += 1) {
      const row = await this.budgets.findOne({
        where: { userId, budgetMonth },
      });
      if (!row) {
        if (!confirm) {
          throw new BadRequestException(
            'This month is not confirmed. Use POST /luno/btc/budget/current to confirm it.',
          );
        }
        try {
          await this.budgets.save(
            this.budgets.create({
              userId,
              budgetMonth,
              monthlyBudgetMyr: config.monthlyBudgetMyr,
              normalBuyAllocationMyr: config.normalBuyAllocationMyr,
              dipReserveAllocationMyr: config.dipReserveAllocationMyr,
              status: 'ACTIVE',
            }),
          );
        } catch (error) {
          if (isCheckViolation(error)) {
            throw rejectedBudget(config.monthlyBudgetMyr);
          }
          if (!isUniqueViolation(error)) {
            throw error;
          }
          const winner = await this.budgets.findOne({
            where: { userId, budgetMonth },
          });
          if (winner && budgetConfigMatches(winner, config)) {
            return this.buildView(userId, month);
          }
          throw budgetWriteConflict();
        }
        return this.buildView(userId, month);
      }
      if (budgetConfigMatches(row, config)) {
        return this.buildView(userId, month);
      }
      let result: { affected?: number | null };
      try {
        result = await conditionalBudgetUpdate(
          this.budgets,
          row,
          config,
        ).execute();
      } catch (error) {
        if (isCheckViolation(error)) {
          throw rejectedBudget(config.monthlyBudgetMyr);
        }
        throw error;
      }
      if ((result.affected ?? 0) > 0) {
        return this.buildView(userId, month);
      }
      const fresh = await this.budgets.findOne({
        where: { userId, budgetMonth },
      });
      if (fresh && budgetConfigMatches(fresh, config)) {
        return this.buildView(userId, month);
      }
      if (!fresh || !budgetSnapshotMatches(fresh, row)) {
        throw budgetWriteConflict();
      }
    }
    throw budgetWriteConflict();
  }

  async getBudgetHistory(userId: string): Promise<LunoBtcBudgetHistoryRow[]> {
    const spend = await this.accounting.getSpendContext();
    const rows = await this.budgets.find({
      where: { userId },
      order: { budgetMonth: 'DESC' },
    });
    return rows.map((row) => {
      const month = monthKeyFromBudgetDate(row.budgetMonth);
      const used = summarizeMonthBuys(spend.classifiedEvents, month);
      const remaining = remainingBudgetMyr(
        row.monthlyBudgetMyr,
        used.purchaseTotalMyr,
      );
      return {
        month,
        budgetMyr: roundMyr(row.monthlyBudgetMyr) ?? '0.00',
        usedMyr: roundMyr(used.purchaseTotalMyr) ?? '0.00',
        remainingMyr: roundMyr(remaining) ?? '0.00',
        status: budgetStatus(row.monthlyBudgetMyr, used.purchaseTotalMyr),
      };
    });
  }

  async getMaxAllowedNewBtcSpend(
    userId: string,
    now = new Date(),
  ): Promise<string> {
    const view = await this.getCurrentBudget(userId, now);
    return view.maxAllowedNewSpendMyr;
  }

  async getStrategyContext(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcStrategyContext> {
    const view = await this.getCurrentBudget(userId, now);
    const spend = await this.accounting.getSpendContext();
    return {
      accountingStatus: spend.accountingStatus,
      monthlyBudgetMyr: view.monthlyBudgetMyr,
      monthlyUsedMyr: view.usedMyr,
      monthlyRemainingMyr: view.remainingMyr,
      maxAllowedNewSpendMyr: view.maxAllowedNewSpendMyr,
      dipReserveAllocationMyr: view.dipReserveAllocationMyr,
      lunoMyrAvailableMyr: view.lunoMyrAvailableMyr,
      strategyMoneyReady: isStrategyMoneyReady({
        accountingStatus: spend.accountingStatus,
        monthlyRemainingMyr: view.remainingMyr,
      }),
    };
  }

  async getMoneyBuckets(userId: string): Promise<LunoBtcMoneyBucketsView> {
    const [totals, health] = await Promise.all([
      this.sumBuckets(userId),
      this.health.getHealth(),
    ]);
    return {
      protectedProfitMyr: roundMyr(totals.protectedProfitMyr) ?? '0.00',
      reinvestmentReserveMyr: roundMyr(totals.reinvestmentReserveMyr) ?? '0.00',
      lunoMyrAvailableMyr: roundMyr(health.myrAvailableBalance),
    };
  }

  async allocateMoneyBucket(
    userId: string,
    input: AllocateLunoBtcMoneyBucketDto,
  ): Promise<LunoBtcMoneyBucketsView> {
    const amountMyr = parsePositiveAmount(input.amountMyr);
    await this.buckets.save(
      this.buckets.create({
        userId,
        bucketType: input.bucketType,
        amountMyr,
        note: input.note?.trim() || null,
        sourceReference: input.sourceReference?.trim() || null,
      }),
    );
    return this.getMoneyBuckets(userId);
  }

  private async buildView(
    userId: string,
    month: string,
  ): Promise<LunoBtcBudgetView> {
    const [spend, row, history, totals, health] = await Promise.all([
      this.accounting.getSpendContext(),
      this.budgets.findOne({
        where: { userId, budgetMonth: monthStartDate(month) },
      }),
      this.budgets.find({
        where: { userId },
        order: { budgetMonth: 'DESC' },
      }),
      this.sumBuckets(userId),
      this.health.getHealth(),
    ]);
    const used = summarizeMonthBuys(spend.classifiedEvents, month);
    const budget = row?.monthlyBudgetMyr ?? null;
    const remaining =
      budget == null ? null : remainingBudgetMyr(budget, used.purchaseTotalMyr);
    const display = budgetDisplayState(budget, used.purchaseTotalMyr);
    const suggestion = history.find(
      (item) => monthKeyFromBudgetDate(item.budgetMonth) < month,
    );
    return {
      month,
      confirmed: row != null,
      monthlyBudgetMyr: roundMyr(budget),
      usedMyr: roundMyr(used.purchaseTotalMyr) ?? '0.00',
      remainingMyr: remaining == null ? null : roundMyr(remaining),
      maxAllowedNewSpendMyr:
        roundMyr(maxAllowedNewBtcSpendMyr(budget, used.purchaseTotalMyr)) ??
        '0.00',
      normalBuyAllocationMyr: roundMyr(row?.normalBuyAllocationMyr ?? null),
      dipReserveAllocationMyr: roundMyr(row?.dipReserveAllocationMyr ?? null),
      normalBuyUsedMyr: null,
      dipReserveUsedMyr: null,
      status: budgetStatus(budget, used.purchaseTotalMyr),
      displayState: display.state,
      displayStateLabel: display.label,
      suggestedBudget: suggestion
        ? {
            month: monthKeyFromBudgetDate(suggestion.budgetMonth),
            monthlyBudgetMyr: roundMyr(suggestion.monthlyBudgetMyr) ?? '0.00',
            normalBuyAllocationMyr: roundMyr(suggestion.normalBuyAllocationMyr),
            dipReserveAllocationMyr: roundMyr(
              suggestion.dipReserveAllocationMyr,
            ),
          }
        : null,
      buyCount: used.buyCount,
      btcReceived: roundBtc(used.btcReceived),
      latestBuyAt: used.latestBuyAt,
      lunoMyrAvailableMyr: roundMyr(health.myrAvailableBalance),
      protectedProfitMyr: roundMyr(totals.protectedProfitMyr) ?? '0.00',
      reinvestmentReserveMyr: roundMyr(totals.reinvestmentReserveMyr) ?? '0.00',
    };
  }

  private async sumBuckets(userId: string): Promise<{
    protectedProfitMyr: string;
    reinvestmentReserveMyr: string;
  }> {
    const rows = await this.buckets.find({ where: { userId } });
    let protectedProfitMyr = '0';
    let reinvestmentReserveMyr = '0';
    for (const row of rows) {
      if (row.bucketType === 'PROTECTED_PROFIT') {
        protectedProfitMyr = addDecimalStrings(
          protectedProfitMyr,
          row.amountMyr,
        );
      }
      if (row.bucketType === 'REINVESTMENT_RESERVE') {
        reinvestmentReserveMyr = addDecimalStrings(
          reinvestmentReserveMyr,
          row.amountMyr,
        );
      }
    }
    return { protectedProfitMyr, reinvestmentReserveMyr };
  }
}

/** Bounded retries apply only while the observed row is unchanged. */
export const BUDGET_WRITE_ATTEMPTS = 3;

/**
 * TypeORM 0.3 UpdateQueryBuilder appends `updated_at = CURRENT_TIMESTAMP`
 * when the payload omits an @UpdateDateColumn. Repeating the existing
 * timestamp keeps the amount-revision clock still on a sleeve-only edit.
 */
export function sleeveOnlyBudgetUpdate(
  row: Pick<LunoBtcMonthlyBudget, 'updatedAt'>,
  config: Pick<
    LunoBtcBudgetConfig,
    'normalBuyAllocationMyr' | 'dipReserveAllocationMyr'
  >,
): Pick<
  LunoBtcMonthlyBudget,
  'normalBuyAllocationMyr' | 'dipReserveAllocationMyr' | 'updatedAt'
> {
  return {
    normalBuyAllocationMyr: config.normalBuyAllocationMyr,
    dipReserveAllocationMyr: config.dipReserveAllocationMyr,
    updatedAt: row.updatedAt,
  };
}

/**
 * Atomic compare-and-swap. The WHERE clause repeats the observed amount,
 * both sleeves, and the millisecond amount-revision time. Sleeve edits keep
 * updated_at, so the timestamp alone cannot separate them. Node dates drop
 * PostgreSQL microseconds, so the timestamp predicate truncates to
 * milliseconds. An amount change leaves updated_at out of SET and TypeORM
 * stamps CURRENT_TIMESTAMP.
 */
export function conditionalBudgetUpdate(
  budgets: Repository<LunoBtcMonthlyBudget>,
  row: LunoBtcMonthlyBudget,
  config: LunoBtcBudgetConfig,
): UpdateQueryBuilder<LunoBtcMonthlyBudget> {
  const values = sameMoney(row.monthlyBudgetMyr, config.monthlyBudgetMyr)
    ? sleeveOnlyBudgetUpdate(row, config)
    : {
        monthlyBudgetMyr: config.monthlyBudgetMyr,
        normalBuyAllocationMyr: config.normalBuyAllocationMyr,
        dipReserveAllocationMyr: config.dipReserveAllocationMyr,
      };
  const update = budgets
    .createQueryBuilder()
    .update(LunoBtcMonthlyBudget)
    .set(values)
    .where('id = :id', { id: row.id })
    .andWhere(`date_trunc('milliseconds', "updated_at") = :observedUpdatedAt`, {
      observedUpdatedAt: row.updatedAt,
    })
    .andWhere('"monthly_budget_myr" = :observedMonthlyBudgetMyr', {
      observedMonthlyBudgetMyr: row.monthlyBudgetMyr,
    });
  observedMoney(
    update,
    '"normal_buy_allocation_myr"',
    'observedNormal',
    row.normalBuyAllocationMyr,
  );
  observedMoney(
    update,
    '"dip_reserve_allocation_myr"',
    'observedDip',
    row.dipReserveAllocationMyr,
  );
  return update;
}

function observedMoney(
  update: UpdateQueryBuilder<LunoBtcMonthlyBudget>,
  column: string,
  param: string,
  value: string | null,
): void {
  if (value == null) {
    update.andWhere(`${column} IS NULL`);
    return;
  }
  update.andWhere(`${column} = :${param}`, { [param]: value });
}

function budgetConfigMatches(
  row: LunoBtcMonthlyBudget,
  config: LunoBtcBudgetConfig,
): boolean {
  return (
    sameMoney(row.monthlyBudgetMyr, config.monthlyBudgetMyr) &&
    sameMoney(row.normalBuyAllocationMyr, config.normalBuyAllocationMyr) &&
    sameMoney(row.dipReserveAllocationMyr, config.dipReserveAllocationMyr)
  );
}

function budgetSnapshotMatches(
  left: LunoBtcMonthlyBudget,
  right: LunoBtcMonthlyBudget,
): boolean {
  return (
    left.updatedAt.getTime() === right.updatedAt.getTime() &&
    sameMoney(left.monthlyBudgetMyr, right.monthlyBudgetMyr) &&
    sameMoney(left.normalBuyAllocationMyr, right.normalBuyAllocationMyr) &&
    sameMoney(left.dipReserveAllocationMyr, right.dipReserveAllocationMyr)
  );
}

function budgetWriteConflict(): ConflictException {
  return new ConflictException(
    'Monthly budget changed before this save finished. Reload the budget and submit it again.',
  );
}

function rejectedBudget(amount: string): BadRequestException {
  return new BadRequestException(
    compareDecimal(amount, '0') === 0
      ? 'RM0 could not be saved because the database still requires a positive monthly budget.'
      : 'This monthly budget could not be saved.',
  );
}

function isCheckViolation(error: unknown): boolean {
  return driverCode(error) === '23514';
}

function isUniqueViolation(error: unknown): boolean {
  return driverCode(error) === '23505';
}

function driverCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const candidate = error as {
    code?: string;
    driverError?: { code?: string };
  };
  return candidate.code ?? candidate.driverError?.code;
}

function sameMoney(left: string | null, right: string | null): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }
  return compareDecimal(left, right) === 0;
}
