import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  calendarMonthKey,
  monthKeyFromBudgetDate,
  monthStartDate,
  summarizeMonthBuys,
} from './accounting/luno-btc-activity';
import {
  budgetStatus,
  isStrategyMoneyReady,
  maxAllowedNewBtcSpendMyr,
  parseBudgetConfig,
  parsePositiveAmount,
  remainingBudgetMyr,
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
import { addDecimalStrings } from './luno-decimal';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoHealthService } from './luno-health.service';

export type LunoBtcBudgetView = {
  month: string;
  monthlyBudgetMyr: string | null;
  usedMyr: string;
  remainingMyr: string | null;
  maxAllowedNewSpendMyr: string;
  normalBuyAllocationMyr: string | null;
  dipReserveAllocationMyr: string | null;
  normalBuyUsedMyr: null;
  dipReserveUsedMyr: null;
  status: LunoBtcBudgetStatus;
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
    const month = calendarMonthKey(now);
    const config = parseBudgetConfig(input);
    const budgetMonth = monthStartDate(month);
    const row = await this.budgets.findOne({
      where: { userId, budgetMonth },
    });
    if (row) {
      row.monthlyBudgetMyr = config.monthlyBudgetMyr;
      row.normalBuyAllocationMyr = config.normalBuyAllocationMyr;
      row.dipReserveAllocationMyr = config.dipReserveAllocationMyr;
      await this.budgets.save(row);
    } else {
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
    }
    return this.buildView(userId, month);
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
    const [spend, row, totals, health] = await Promise.all([
      this.accounting.getSpendContext(),
      this.budgets.findOne({
        where: { userId, budgetMonth: monthStartDate(month) },
      }),
      this.sumBuckets(userId),
      this.health.getHealth(),
    ]);
    const used = summarizeMonthBuys(spend.classifiedEvents, month);
    const budget = row?.monthlyBudgetMyr ?? null;
    const remaining =
      budget == null ? null : remainingBudgetMyr(budget, used.purchaseTotalMyr);
    return {
      month,
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
