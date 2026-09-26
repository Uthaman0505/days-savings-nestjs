import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { asDecimalString, compareDecimal } from './luno-decimal';
import { roundBtc, roundMyr } from './accounting/luno-btc-formulas';
import {
  buildOpenPositionMetrics,
  defaultHarvestSettings,
  evaluateBtcHarvest,
  HARVEST_TTL_MS,
  isActionableHarvest,
  saleMatchesHarvestRecommendation,
  splitRealizedProfit,
  type HarvestDecision,
  type LunoBtcHarvestAction,
  type LunoBtcHarvestSettingsValues,
  type LunoBtcHarvestZone,
} from './accounting/luno-btc-harvest';
import type { ClassifiedEvent } from './accounting/luno-btc.types';
import type { PatchLunoBtcHarvestSettingsDto } from './dto/luno-btc-harvest.dto';
import {
  LunoBtcHarvestEvent,
  type LunoBtcHarvestEventStatus,
} from './entities/luno-btc-harvest-event.entity';
import { LunoBtcHarvestSettings } from './entities/luno-btc-harvest-settings.entity';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoConfigService } from './luno-config.service';

export type LunoBtcHarvestView = HarvestDecision & {
  lifetime: {
    realizedProfitMyr: string;
    overallReturnPct: string | null;
  };
  manualSellNote: string;
  eventId: string | null;
  validUntil: string | null;
  status: LunoBtcHarvestEventStatus | null;
};

export type LunoBtcHarvestHistoryRow = {
  id: string;
  occurredAt: string;
  action: LunoBtcHarvestAction;
  displayAction: string;
  zone: LunoBtcHarvestZone;
  suggestedHarvestMyr: string | null;
  suggestedBtcToSell: string | null;
  triggerPriceMyr: string | null;
  profitPct: string | null;
  status: LunoBtcHarvestEventStatus;
};

export type LunoBtcHarvestSettingsView = LunoBtcHarvestSettingsValues & {
  estimatedFeeLabel: string;
};

const MANUAL_SELL_NOTE = 'Sale must be completed manually in Luno.';

@Injectable()
export class LunoBtcHarvestService {
  constructor(
    @InjectRepository(LunoBtcHarvestEvent)
    private readonly events: Repository<LunoBtcHarvestEvent>,
    @InjectRepository(LunoBtcHarvestSettings)
    private readonly settings: Repository<LunoBtcHarvestSettings>,
    private readonly accounting: LunoBtcAccountingService,
    private readonly budget: LunoBtcBudgetService,
    private readonly config: LunoConfigService,
  ) {}

  async getCurrentHarvest(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcHarvestView> {
    return this.recalculateCurrentHarvest(userId, now);
  }

  async getHarvestHistory(userId: string): Promise<LunoBtcHarvestHistoryRow[]> {
    const rows = await this.events.find({
      where: { userId },
      order: { triggeredAt: 'DESC' },
    });
    return rows.filter(isMeaningfulHarvestHistory).map((row) => ({
      id: row.id,
      occurredAt: row.triggeredAt.toISOString(),
      action: row.action,
      displayAction: displayStoredHarvestAction(row.action),
      zone: row.zone,
      suggestedHarvestMyr: roundMyr(row.suggestedHarvestMyr),
      suggestedBtcToSell: roundBtc(row.suggestedBtcToSell),
      triggerPriceMyr: roundMyr(row.triggerPriceMyr),
      profitPct: roundMyr(row.profitPct),
      status: row.status,
    }));
  }

  async getSettings(userId: string): Promise<LunoBtcHarvestSettingsView> {
    const row = await this.ensureSettings(userId);
    return this.toSettingsView(settingsFromRow(row));
  }

  async patchSettings(
    userId: string,
    input: PatchLunoBtcHarvestSettingsDto,
  ): Promise<LunoBtcHarvestSettingsView> {
    const row = await this.ensureSettings(userId);
    if (input.minimumHarvestMyr != null) {
      const value = asDecimalString(input.minimumHarvestMyr);
      if (compareDecimal(value, '0') <= 0) {
        throw new BadRequestException(
          'minimumHarvestMyr must be greater than 0.',
        );
      }
      row.minimumHarvestMyr = value;
    }
    if (input.estimatedSellFeeMyr != null) {
      const value = asDecimalString(input.estimatedSellFeeMyr);
      if (compareDecimal(value, '0') < 0) {
        throw new BadRequestException(
          'estimatedSellFeeMyr cannot be negative.',
        );
      }
      row.estimatedSellFeeMyr = value;
    }
    if (input.minimumCorePct != null) {
      const value = asDecimalString(input.minimumCorePct);
      if (
        compareDecimal(value, '0') <= 0 ||
        compareDecimal(value, '100') >= 0
      ) {
        throw new BadRequestException(
          'minimumCorePct must be greater than 0 and less than 100.',
        );
      }
      row.minimumCorePct = value;
    }
    await this.settings.save(row);
    return this.toSettingsView(settingsFromRow(row));
  }

  async recalculateAll(now = new Date()): Promise<void> {
    const [settingRows, openRows] = await Promise.all([
      this.settings.find(),
      this.events.find({ where: { status: 'OPEN' } }),
    ]);
    const userIds = new Set<string>();
    for (const row of settingRows) {
      userIds.add(row.userId);
    }
    for (const row of openRows) {
      userIds.add(row.userId);
    }
    for (const userId of userIds) {
      await this.recalculateCurrentHarvest(userId, now);
    }
  }

  async recalculateCurrentHarvest(
    userId: string,
    now = new Date(),
  ): Promise<LunoBtcHarvestView> {
    const settingsRow = await this.ensureSettings(userId);
    const settings = settingsFromRow(settingsRow);
    const rows = await this.events.find({
      where: { userId },
      order: { triggeredAt: 'ASC' },
    });
    this.expireStaleEvents(rows, now);
    const details = await this.accounting.getComputeDetails();
    await this.matchSales(
      userId,
      rows,
      details.classifiedEvents,
      details.fifo.disposals,
      settings,
    );
    const actedZones = rows
      .filter((row) => row.status === 'ACTED' && isHarvestTriggerZone(row.zone))
      .map((row) => row.zone);
    const portfolio = details.portfolio;
    const metrics = buildOpenPositionMetrics({
      currentBtcBalance: portfolio.btcQuantity,
      currentPriceMyr: portfolio.btcPriceMyr,
      openAverageBuyPriceMyr: portfolio.averageBuyPriceMyr,
      openCostBasisMyr: portfolio.remainingCostBasisMyr,
      lifetimeMoneyPutInMyr: portfolio.moneyPutInMyr,
      principalRecoveredMyr: portfolio.principalRecoveredMyr,
      lifetimeRealizedProfitMyr: portfolio.profitAlreadyTakenMyr,
    });
    const decision = evaluateBtcHarvest({
      accountingStatus: portfolio.status,
      metrics,
      lots: details.fifo.lots,
      settings,
      actedZones,
    });
    const event = await this.persistDecision(
      userId,
      rows,
      decision,
      metrics.currentPriceMyr,
      metrics.openAverageBuyPriceMyr,
      now,
    );
    await this.events.save(rows);
    return this.toView(
      decision,
      event,
      portfolio.overallReturnPct,
      portfolio.profitAlreadyTakenMyr,
    );
  }

  private expireStaleEvents(rows: LunoBtcHarvestEvent[], now: Date): void {
    for (const row of rows) {
      if (row.status !== 'OPEN' || !isActionableHarvest(row.action)) {
        continue;
      }
      if (row.validUntil && row.validUntil.getTime() <= now.getTime()) {
        row.status = 'EXPIRED';
      }
    }
  }

  private async matchSales(
    userId: string,
    rows: LunoBtcHarvestEvent[],
    classified: ClassifiedEvent[],
    disposals: { reference: string | null; realisedPnlMyr: string }[],
    settings: LunoBtcHarvestSettingsValues,
  ): Promise<void> {
    const usedRefs = new Set(
      rows
        .map((row) => row.matchedTransactionRef)
        .filter((value): value is string => Boolean(value)),
    );
    for (const row of rows) {
      if (row.status !== 'OPEN' || !isActionableHarvest(row.action)) {
        continue;
      }
      const match = classified.find((event) => {
        if (event.classification !== 'BTC_SELL') {
          return false;
        }
        if (event.occurredAt.getTime() < row.triggeredAt.getTime()) {
          return false;
        }
        const ref = event.reference ?? event.sourceTransactionIds[0] ?? '';
        if (!ref || usedRefs.has(ref)) {
          return false;
        }
        return saleMatchesHarvestRecommendation({
          soldBtc: event.btcQuantity,
          proceedsMyr: event.myrAmount,
          suggestedBtc: row.suggestedBtcToSell,
          suggestedHarvestMyr: row.suggestedHarvestMyr,
        });
      });
      if (!match) {
        continue;
      }
      const ref = match.reference ?? match.sourceTransactionIds[0] ?? 'matched';
      row.status = 'ACTED';
      row.actedAt = match.occurredAt;
      row.matchedTransactionRef = ref;
      usedRefs.add(ref);
      const disposal = disposals.find((item) => item.reference === ref);
      const realized = disposal?.realisedPnlMyr ?? '0';
      if (compareDecimal(realized, '0') > 0) {
        const split = splitRealizedProfit(realized, settings);
        if (compareDecimal(split.protectedProfitMyr, '0') > 0) {
          await this.budget.allocateMoneyBucket(userId, {
            bucketType: 'PROTECTED_PROFIT',
            amountMyr: split.protectedProfitMyr,
            sourceReference: ref,
            note: 'Protected profit from matched BTC harvest sale.',
          });
        }
        if (compareDecimal(split.reinvestmentReserveMyr, '0') > 0) {
          await this.budget.allocateMoneyBucket(userId, {
            bucketType: 'REINVESTMENT_RESERVE',
            amountMyr: split.reinvestmentReserveMyr,
            sourceReference: ref,
            note: 'Reinvestment reserve from matched BTC harvest sale.',
          });
        }
      }
    }
  }

  private async persistDecision(
    userId: string,
    rows: LunoBtcHarvestEvent[],
    decision: HarvestDecision,
    currentPriceMyr: string | null,
    openAveragePriceMyr: string | null,
    now: Date,
  ): Promise<LunoBtcHarvestEvent | null> {
    if (!isActionableHarvest(decision.action)) {
      for (const row of rows) {
        if (row.status === 'OPEN' && isActionableHarvest(row.action)) {
          row.status = 'SUPERSEDED';
        }
      }
    } else {
      for (const row of rows) {
        if (
          row.status === 'OPEN' &&
          isActionableHarvest(row.action) &&
          row.zone !== decision.zone
        ) {
          row.status = 'SUPERSEDED';
        }
      }
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
        action: decision.action,
        zone: decision.zone,
        triggerPriceMyr: currentPriceMyr,
        openAveragePriceMyr,
        profitPct: decision.currentPosition.unrealizedProfitPct,
        suggestedHarvestMyr:
          decision.recommendation?.suggestedHarvestMyr ?? null,
        suggestedBtcToSell: decision.recommendation?.btcToSell ?? null,
        status: 'OPEN',
        reasonJson: decision.reason,
        triggeredAt: now,
        validUntil: isActionableHarvest(decision.action)
          ? new Date(now.getTime() + HARVEST_TTL_MS)
          : null,
        actedAt: null,
        matchedTransactionRef: null,
      }),
    );
    rows.push(created);
    return created;
  }

  private async ensureSettings(
    userId: string,
  ): Promise<LunoBtcHarvestSettings> {
    const existing = await this.settings.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }
    const defaults = defaultHarvestSettings({
      minimumHarvestMyr: this.config.minHarvestMyr,
      estimatedSellFeeMyr: this.config.estimatedSellFeeMyr,
    });
    return this.settings.save(
      this.settings.create({
        userId,
        ...defaults,
      }),
    );
  }

  private toView(
    decision: HarvestDecision,
    event: LunoBtcHarvestEvent | null,
    overallReturnPct: string | null,
    lifetimeRealizedProfitMyr: string,
  ): LunoBtcHarvestView {
    return {
      ...decision,
      currentPosition: {
        marketValueMyr: roundMyr(decision.currentPosition.marketValueMyr),
        openCostBasisMyr:
          roundMyr(decision.currentPosition.openCostBasisMyr) ?? '0.00',
        unrealizedProfitMyr: roundMyr(
          decision.currentPosition.unrealizedProfitMyr,
        ),
        unrealizedProfitPct: roundMyr(
          decision.currentPosition.unrealizedProfitPct,
        ),
      },
      recommendation: decision.recommendation
        ? {
            suggestedHarvestMyr: roundMyr(
              decision.recommendation.suggestedHarvestMyr,
            ),
            btcToSell: roundBtc(decision.recommendation.btcToSell),
            estimatedRealizedProfitMyr: roundMyr(
              decision.recommendation.estimatedRealizedProfitMyr,
            ),
            fifoCostBasisReleasedMyr: roundMyr(
              decision.recommendation.fifoCostBasisReleasedMyr,
            ),
            remainingBtc: roundBtc(decision.recommendation.remainingBtc),
            remainingMarketValueMyr: roundMyr(
              decision.recommendation.remainingMarketValueMyr,
            ),
            estimatedFeesMyr: roundMyr(
              decision.recommendation.estimatedFeesMyr,
            ),
          }
        : null,
      profitSplit: {
        protectedProfitMyr: roundMyr(decision.profitSplit.protectedProfitMyr),
        reinvestmentReserveMyr: roundMyr(
          decision.profitSplit.reinvestmentReserveMyr,
        ),
      },
      principalRecovery: {
        ...decision.principalRecovery,
        currentPct: roundMyr(decision.principalRecovery.currentPct),
        projectedPct: roundMyr(decision.principalRecovery.projectedPct),
        remainingUnrecoveredAfterMyr: roundMyr(
          decision.principalRecovery.remainingUnrecoveredAfterMyr,
        ),
        recoveredMyr:
          roundMyr(decision.principalRecovery.recoveredMyr) ?? '0.00',
        remainingUnrecoveredMyr:
          roundMyr(decision.principalRecovery.remainingUnrecoveredMyr) ??
          '0.00',
        projectedRecoveredMyr: roundMyr(
          decision.principalRecovery.projectedRecoveredMyr,
        ),
      },
      salePreview: decision.salePreview
        ? {
            ...decision.salePreview,
            grossProceedsMyr:
              roundMyr(decision.salePreview.grossProceedsMyr) ??
              decision.salePreview.grossProceedsMyr,
            estimatedFeesMyr:
              roundMyr(decision.salePreview.estimatedFeesMyr) ??
              decision.salePreview.estimatedFeesMyr,
            netProceedsMyr:
              roundMyr(decision.salePreview.netProceedsMyr) ??
              decision.salePreview.netProceedsMyr,
            fifoCostBasisReleasedMyr:
              roundMyr(decision.salePreview.fifoCostBasisReleasedMyr) ??
              decision.salePreview.fifoCostBasisReleasedMyr,
            estimatedRealizedProfitMyr:
              roundMyr(decision.salePreview.estimatedRealizedProfitMyr) ??
              decision.salePreview.estimatedRealizedProfitMyr,
            remainingBtc:
              roundBtc(decision.salePreview.remainingBtc) ??
              decision.salePreview.remainingBtc,
            remainingCostBasisMyr:
              roundMyr(decision.salePreview.remainingCostBasisMyr) ??
              decision.salePreview.remainingCostBasisMyr,
            remainingAverageBuyPriceMyr: roundMyr(
              decision.salePreview.remainingAverageBuyPriceMyr,
            ),
          }
        : null,
      lifetime: {
        realizedProfitMyr: roundMyr(lifetimeRealizedProfitMyr) ?? '0.00',
        overallReturnPct: roundMyr(overallReturnPct),
      },
      manualSellNote: MANUAL_SELL_NOTE,
      eventId: event?.id ?? null,
      validUntil: event?.validUntil?.toISOString() ?? null,
      status: event?.status ?? null,
    };
  }

  private toSettingsView(
    settings: LunoBtcHarvestSettingsValues,
  ): LunoBtcHarvestSettingsView {
    return {
      ...settings,
      minimumHarvestMyr: roundMyr(settings.minimumHarvestMyr) ?? '5.00',
      estimatedSellFeeMyr: roundMyr(settings.estimatedSellFeeMyr) ?? '0.00',
      estimatedFeeLabel: 'Estimated sell fee (not a live Luno fee)',
    };
  }
}

function settingsFromRow(
  row: LunoBtcHarvestSettings,
): LunoBtcHarvestSettingsValues {
  return {
    firstHarvestProfitPct: row.firstHarvestProfitPct,
    secondHarvestProfitPct: row.secondHarvestProfitPct,
    highHarvestProfitPct: row.highHarvestProfitPct,
    firstHarvestProfitFraction: row.firstHarvestProfitFraction,
    secondHarvestProfitFraction: row.secondHarvestProfitFraction,
    highHarvestProfitFraction: row.highHarvestProfitFraction,
    protectedProfitPct: row.protectedProfitPct,
    reinvestmentReservePct: row.reinvestmentReservePct,
    minimumCorePct: row.minimumCorePct,
    minimumHarvestMyr: row.minimumHarvestMyr,
    estimatedSellFeeMyr: row.estimatedSellFeeMyr,
    minimumBtcSale: row.minimumBtcSale,
  };
}

function isHarvestTriggerZone(zone: LunoBtcHarvestZone): boolean {
  return (
    zone === 'FIRST_HARVEST' || zone === 'PROTECT' || zone === 'HIGH_PROTECT'
  );
}

function isMeaningfulHarvestHistory(row: LunoBtcHarvestEvent): boolean {
  return (
    row.action === 'TAKE_SOME_PROFIT' ||
    row.action === 'PROTECT_PROFIT' ||
    row.action === 'HOLD_CORE'
  );
}

function displayStoredHarvestAction(action: LunoBtcHarvestAction): string {
  if (action === 'TAKE_SOME_PROFIT') {
    return 'TAKE SOME PROFIT';
  }
  if (action === 'PROTECT_PROFIT') {
    return 'PROTECT PROFIT';
  }
  if (action === 'HOLD_CORE') {
    return 'HOLD CORE';
  }
  return 'HOLD';
}
