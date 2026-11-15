import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  calendarMonthKey,
  monthStartDate,
} from './accounting/luno-btc-activity';
import {
  amountsMatch,
  buyCashMyr,
  DECISION_TTL_MS,
  displayActionFor,
  evaluateBtcBuyDecision,
  isBuyAction,
  isMeaningfulHistoryAction,
  stagedTargetMyr,
  type BuyDecision,
} from './accounting/luno-btc-decision';
import { roundMyr } from './accounting/luno-btc-formulas';
import type { ClassifiedEvent } from './accounting/luno-btc.types';
import {
  LunoBtcStrategyEvent,
  type LunoBtcStrategyAction,
  type LunoBtcStrategyEventStatus,
  type LunoBtcStrategyZone,
} from './entities/luno-btc-strategy-event.entity';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import {
  addDecimalStrings,
  compareDecimal,
  subtractDecimalStrings,
} from './luno-decimal';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';

export type LunoBtcDecisionView = BuyDecision & {
  validUntil: string | null;
  eventId: string | null;
  month: string;
};

export type LunoBtcDecisionHistoryRow = {
  id: string;
  occurredAt: string;
  action: LunoBtcStrategyAction;
  displayAction: string;
  suggestedAmountMyr: string | null;
  currentPriceMyr: string | null;
  status: LunoBtcStrategyEventStatus;
  zone: LunoBtcStrategyZone;
};

@Injectable()
export class LunoBtcDecisionService {
  constructor(
    @InjectRepository(LunoBtcStrategyEvent)
    private readonly events: Repository<LunoBtcStrategyEvent>,
    @InjectRepository(LunoBtcMonthlyBudget)
    private readonly budgets: Repository<LunoBtcMonthlyBudget>,
    private readonly accounting: LunoBtcAccountingService,
    private readonly budget: LunoBtcBudgetService,
  ) {}

  async getCurrentDecision(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcDecisionView> {
    return this.recalculateCurrentBtcDecision(userId, now);
  }

  async getDecisionHistory(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcDecisionHistoryRow[]> {
    const month = calendarMonthKey(now);
    const rows = await this.events.find({
      where: { userId, budgetMonth: monthStartDate(month) },
      order: { triggeredAt: 'DESC' },
    });
    return rows
      .filter((row) => isMeaningfulHistoryAction(row.action))
      .map((row) => ({
        id: row.id,
        occurredAt: row.triggeredAt.toISOString(),
        action: row.action,
        displayAction: displayActionFor(row.action),
        suggestedAmountMyr: roundMyr(row.suggestedAmountMyr),
        currentPriceMyr: roundMyr(row.currentPriceMyr),
        status: row.status,
        zone: row.zone,
      }));
  }

  async recalculateAllForCurrentMonth(now = new Date()): Promise<void> {
    const month = monthStartDate(calendarMonthKey(now));
    const [budgetRows, openRows] = await Promise.all([
      this.budgets.find({ where: { budgetMonth: month } }),
      this.events.find({ where: { budgetMonth: month, status: 'OPEN' } }),
    ]);
    const userIds = new Set<string>();
    for (const row of budgetRows) {
      userIds.add(row.userId);
    }
    for (const row of openRows) {
      userIds.add(row.userId);
    }
    for (const userId of userIds) {
      await this.recalculateCurrentBtcDecision(userId, now);
    }
  }

  async recalculateCurrentBtcDecision(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcDecisionView> {
    const month = calendarMonthKey(now);
    const budgetMonth = monthStartDate(month);
    const [spend, budget] = await Promise.all([
      this.accounting.getSpendContext(),
      this.budget.getCurrentBudget(userId, now),
    ]);
    const [monthEvents, budgetRow] = await Promise.all([
      this.events.find({
        where: { userId, budgetMonth },
        order: { triggeredAt: 'ASC' },
      }),
      this.budgets.findOne({ where: { userId, budgetMonth } }),
    ]);
    this.expireStaleEvents(monthEvents, budget.remainingMyr, now);
    this.matchPurchases(monthEvents, spend.classifiedEvents, month);
    // updatedAt is the last monthly-amount save. Sleeve-only saves do not move it.
    this.inferFirstBuyZoneFromPurchases(
      userId,
      budgetMonth,
      month,
      monthEvents,
      spend.classifiedEvents,
      budget.monthlyBudgetMyr,
      budgetRow?.updatedAt ?? null,
    );
    const actedZones = monthEvents
      .filter((row) => row.status === 'ACTED' && isBuyZone(row.zone))
      .map((row) => row.zone);
    const remainingSleeves = remainingSleevesFromEvents(monthEvents, budget);
    const decision = evaluateBtcBuyDecision({
      accountingStatus: spend.accountingStatus,
      currentBtcPriceMyr: spend.currentBtcPriceMyr,
      averageBuyPriceMyr: spend.averageBuyPriceMyr,
      monthlyBudgetMyr: budget.monthlyBudgetMyr,
      monthlyUsedMyr: budget.usedMyr,
      monthlyRemainingMyr: budget.remainingMyr,
      maxAllowedNewSpendMyr: budget.maxAllowedNewSpendMyr,
      normalBuyAllocationMyr: budget.normalBuyAllocationMyr,
      dipReserveAllocationMyr: budget.dipReserveAllocationMyr,
      lunoMyrAvailableMyr: budget.lunoMyrAvailableMyr,
      actedZones,
      remainingNormalBuyMyr: remainingSleeves.normal,
      remainingDipReserveMyr: remainingSleeves.dip,
    });
    const event = await this.persistDecision(
      userId,
      budgetMonth,
      monthEvents,
      decision,
      now,
    );
    await this.events.save(monthEvents);
    return this.toView(month, decision, event);
  }

  private expireStaleEvents(
    rows: LunoBtcStrategyEvent[],
    remainingMyr: string | null,
    now: Date,
  ): void {
    for (const row of rows) {
      if (row.status !== 'OPEN' || !isBuyAction(row.action)) {
        continue;
      }
      if (row.validUntil && row.validUntil.getTime() <= now.getTime()) {
        row.status = 'EXPIRED';
        continue;
      }
      if (remainingMyr == null || compareDecimal(remainingMyr, '0') <= 0) {
        row.status = 'EXPIRED';
      }
    }
  }

  private matchPurchases(
    rows: LunoBtcStrategyEvent[],
    classified: ClassifiedEvent[],
    monthKey: string,
  ): void {
    const usedRefs = linkedPurchaseRefs(rows);
    for (const row of rows) {
      if (
        row.status !== 'OPEN' ||
        !isBuyAction(row.action) ||
        !row.suggestedAmountMyr
      ) {
        continue;
      }
      if (zoneAlreadyActed(rows, row.zone)) {
        continue;
      }
      const match = classified.find(
        (event) =>
          this.buyCanLink(event, monthKey, row.triggeredAt, usedRefs, null) &&
          amountsMatch(buyCashMyr(event), row.suggestedAmountMyr ?? '0'),
      );
      if (!match) {
        continue;
      }
      this.linkPurchase(row, match, usedRefs);
    }
  }

  private inferFirstBuyZoneFromPurchases(
    userId: string,
    budgetMonth: string,
    monthKey: string,
    rows: LunoBtcStrategyEvent[],
    classified: ClassifiedEvent[],
    monthlyBudgetMyr: string | null,
    budgetRevisedAt: Date | null,
  ): void {
    if (monthlyBudgetMyr == null) {
      return;
    }
    if (zoneAlreadyActed(rows, 'FIRST_BUY_ZONE')) {
      return;
    }
    const target = stagedTargetMyr(monthlyBudgetMyr, 'FIRST_BUY_ZONE');
    if (target == null) {
      return;
    }
    const usedRefs = linkedPurchaseRefs(rows);
    const buy = classified
      .filter(
        (event) =>
          this.buyCanLink(event, monthKey, null, usedRefs, budgetRevisedAt) &&
          amountsMatch(buyCashMyr(event), target),
      )
      .sort(
        (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
      )[0];
    if (!buy) {
      return;
    }
    const ref = purchaseRefs(buy)[0];
    for (const identity of purchaseRefs(buy)) {
      usedRefs.add(identity);
    }
    rows.push(
      this.events.create({
        userId,
        budgetMonth,
        action: 'BUY_SMALL',
        zone: 'FIRST_BUY_ZONE',
        source: 'NORMAL_BUY',
        suggestedAmountMyr: target,
        currentPriceMyr: null,
        averageBuyPriceMyr: null,
        priceDifferencePct: null,
        monthlyRemainingBeforeMyr: null,
        expectedRemainingAfterMyr: null,
        lunoMyrAvailableMyr: null,
        topUpNeededMyr: null,
        status: 'ACTED',
        reasonJson: ['Matched a completed Luno BTC purchase in this zone.'],
        triggeredAt: buy.occurredAt,
        validUntil: null,
        actedAt: buy.occurredAt,
        matchedTransactionRef: ref,
      }),
    );
  }

  private buyCanLink(
    event: ClassifiedEvent,
    monthKey: string,
    notBefore: Date | null,
    usedRefs: Set<string>,
    budgetRevisedAt: Date | null,
  ): boolean {
    if (event.classification !== 'BTC_BUY') {
      return false;
    }
    if (calendarMonthKey(event.occurredAt) !== monthKey) {
      return false;
    }
    if (notBefore && event.occurredAt.getTime() < notBefore.getTime()) {
      return false;
    }
    if (
      budgetRevisedAt &&
      event.occurredAt.getTime() < budgetRevisedAt.getTime()
    ) {
      return false;
    }
    const refs = purchaseRefs(event);
    return refs.length > 0 && refs.every((ref) => !usedRefs.has(ref));
  }

  private linkPurchase(
    row: LunoBtcStrategyEvent,
    match: ClassifiedEvent,
    usedRefs: Set<string>,
  ): void {
    if (row.status === 'ACTED') {
      return;
    }
    const refs = purchaseRefs(match);
    row.status = 'ACTED';
    row.actedAt = match.occurredAt;
    row.matchedTransactionRef = refs[0] ?? null;
    for (const ref of refs) {
      usedRefs.add(ref);
    }
  }

  private async persistDecision(
    userId: string,
    budgetMonth: string,
    rows: LunoBtcStrategyEvent[],
    decision: BuyDecision,
    now: Date,
  ): Promise<LunoBtcStrategyEvent | null> {
    if (decision.action === 'BLOCKED') {
      for (const row of rows) {
        if (row.status === 'OPEN' && isBuyAction(row.action)) {
          row.status = 'EXPIRED';
        }
      }
      return null;
    }
    if (!isBuyAction(decision.action)) {
      for (const row of rows) {
        if (row.status === 'OPEN' && isBuyAction(row.action)) {
          row.status = 'EXPIRED';
        }
      }
    } else {
      for (const row of rows) {
        if (
          row.status === 'OPEN' &&
          isBuyAction(row.action) &&
          row.zone !== decision.zone
        ) {
          row.status = 'SUPERSEDED';
        }
      }
    }
    const openSameZone = rows.find(
      (row) =>
        row.status === 'OPEN' &&
        isBuyAction(row.action) &&
        row.zone === decision.zone,
    );
    if (openSameZone && isBuyAction(decision.action)) {
      return openSameZone;
    }
    const existingOpen = rows.find(
      (row) =>
        row.status === 'OPEN' &&
        row.action === decision.action &&
        row.zone === decision.zone,
    );
    if (existingOpen) {
      return existingOpen;
    }
    const created = await this.events.save(
      this.events.create({
        userId,
        budgetMonth,
        action: decision.action,
        zone: decision.zone,
        source: decision.source,
        suggestedAmountMyr: decision.suggestedAmountMyr,
        currentPriceMyr: decision.currentPriceMyr,
        averageBuyPriceMyr: decision.averageBuyPriceMyr,
        priceDifferencePct: decision.priceDifferencePct,
        monthlyRemainingBeforeMyr: decision.monthlyRemainingMyr,
        expectedRemainingAfterMyr: decision.expectedRemainingAfterMyr,
        lunoMyrAvailableMyr: decision.lunoMyrAvailableMyr,
        topUpNeededMyr: decision.topUpNeededMyr,
        status: 'OPEN',
        reasonJson: decision.reason,
        triggeredAt: now,
        validUntil: isBuyAction(decision.action)
          ? new Date(now.getTime() + DECISION_TTL_MS)
          : null,
        actedAt: null,
        matchedTransactionRef: null,
      }),
    );
    rows.push(created);
    return created;
  }

  private toView(
    month: string,
    decision: BuyDecision,
    event: LunoBtcStrategyEvent | null,
  ): LunoBtcDecisionView {
    return {
      ...decision,
      suggestedAmountMyr: roundMyr(decision.suggestedAmountMyr),
      currentPriceMyr: roundMyr(decision.currentPriceMyr),
      averageBuyPriceMyr: roundMyr(decision.averageBuyPriceMyr),
      priceDifferencePct: roundMyr(decision.priceDifferencePct),
      monthlyBudgetMyr: roundMyr(decision.monthlyBudgetMyr),
      monthlyUsedMyr: roundMyr(decision.monthlyUsedMyr) ?? '0.00',
      monthlyRemainingMyr: roundMyr(decision.monthlyRemainingMyr),
      maxAllowedNewSpendMyr: roundMyr(decision.maxAllowedNewSpendMyr) ?? '0.00',
      lunoMyrAvailableMyr: roundMyr(decision.lunoMyrAvailableMyr),
      topUpNeededMyr: roundMyr(decision.topUpNeededMyr),
      expectedRemainingAfterMyr: roundMyr(decision.expectedRemainingAfterMyr),
      validUntil: event?.validUntil?.toISOString() ?? null,
      eventId: event?.id ?? null,
      month,
    };
  }
}

function isBuyZone(zone: LunoBtcStrategyZone): boolean {
  return (
    zone === 'FIRST_BUY_ZONE' ||
    zone === 'STRONGER_BUY_ZONE' ||
    zone === 'DEEPER_DIP'
  );
}

function remainingSleevesFromEvents(
  rows: LunoBtcStrategyEvent[],
  budget: {
    normalBuyAllocationMyr: string | null;
    dipReserveAllocationMyr: string | null;
  },
): { normal: string | null; dip: string | null } {
  const acted = rows.filter((row) => row.status === 'ACTED');
  const usedNormal = acted
    .filter((row) => row.source === 'NORMAL_BUY')
    .reduce(
      (sum, row) => addDecimalStrings(sum, row.suggestedAmountMyr ?? '0'),
      '0',
    );
  const usedDip = acted
    .filter((row) => row.source === 'DIP_BUY')
    .reduce(
      (sum, row) => addDecimalStrings(sum, row.suggestedAmountMyr ?? '0'),
      '0',
    );
  return {
    normal:
      budget.normalBuyAllocationMyr == null
        ? null
        : maxZero(
            subtractDecimalStrings(budget.normalBuyAllocationMyr, usedNormal),
          ),
    dip:
      budget.dipReserveAllocationMyr == null
        ? null
        : maxZero(
            subtractDecimalStrings(budget.dipReserveAllocationMyr, usedDip),
          ),
  };
}

function maxZero(value: string): string {
  return compareDecimal(value, '0') < 0 ? '0' : value;
}

function zoneAlreadyActed(
  rows: LunoBtcStrategyEvent[],
  zone: LunoBtcStrategyEvent['zone'],
): boolean {
  return rows.some((row) => row.status === 'ACTED' && row.zone === zone);
}

function linkedPurchaseRefs(rows: LunoBtcStrategyEvent[]): Set<string> {
  return new Set(
    rows
      .map((row) => row.matchedTransactionRef)
      .filter((value): value is string => Boolean(value)),
  );
}

function purchaseRefs(event: ClassifiedEvent): string[] {
  const refs: string[] = [];
  if (event.reference) {
    refs.push(event.reference);
  }
  for (const id of event.sourceTransactionIds ?? []) {
    if (id && !refs.includes(id)) {
      refs.push(id);
    }
  }
  return refs;
}
