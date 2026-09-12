import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoldPlanningService } from './gold-planning.service';
import { GoldPlanningSettings } from './gold-planning-settings.entity';
import { GoldProfitGoal } from './gold-profit-goal.entity';
import { GoldService } from './gold.service';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';
import { addCalendarDays } from './gold-price-analytics';
import type { GoldPriceObservation } from './gold-price-analytics';

const NOW = new Date('2026-09-05T02:00:00.000Z');
const TODAY = '2026-09-05';

function purchase(
  partial: Partial<GoldPurchaseObservation> & { id: string },
): GoldPurchaseObservation {
  return {
    purchaseDate: '2026-08-01',
    weightGrams: '2.0000',
    amountPaidCents: 100000,
    pricePerGramCents: 50000,
    source: 'MANUAL',
    referenceNumber: null,
    createdAt: NOW,
    isActive: true,
    ...partial,
  };
}

function priceRow(
  i: number,
  sell: number,
  spread: number,
): GoldPriceObservation {
  const priceDate = addCalendarDays(TODAY, i - 11);
  return {
    id: `p${i}`,
    priceDate,
    capturedPriceAt: new Date(`${priceDate}T02:00:00.000Z`),
    createdAt: new Date(`${priceDate}T02:00:00.000Z`),
    pgSellPricePerGramCents: sell,
    pgBuyPricePerGramCents: sell - spread,
    source: 'SCREENSHOT',
  };
}

describe('GoldPlanningService', () => {
  let service: GoldPlanningService;
  const settingsRows: GoldPlanningSettings[] = [];
  const goalRows: GoldProfitGoal[] = [];
  const goldService = {
    getGoldAnalyticsSource: jest.fn(),
  };
  const settingsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const goalsRepo = {
    findOne: jest.fn(),
  };

  const fallingPrices = Array.from({ length: 12 }, (_, i) =>
    priceRow(i, 72000 - i * 500, 2000),
  );

  const defaultSource = {
    purchases: [purchase({ id: 'a' })],
    prices: fallingPrices,
    latestPrice: {
      pgBuyPricePerGramCents: 64000,
      pgSellPricePerGramCents: 66000,
      priceDate: TODAY,
    },
    todayPriceDate: TODAY,
  };

  beforeEach(async () => {
    settingsRows.length = 0;
    goalRows.length = 0;
    goldService.getGoldAnalyticsSource.mockReset();
    goldService.getGoldAnalyticsSource.mockResolvedValue(defaultSource);
    settingsRepo.findOne.mockReset();
    settingsRepo.create.mockReset();
    settingsRepo.save.mockReset();
    goalsRepo.findOne.mockReset();

    settingsRepo.findOne.mockImplementation(async ({ where }) => {
      return settingsRows.find((row) => row.userId === where.userId) ?? null;
    });
    settingsRepo.create.mockImplementation(
      (input: Partial<GoldPlanningSettings>) => ({ ...input }),
    );
    settingsRepo.save.mockImplementation(async (row: GoldPlanningSettings) => {
      const saved: GoldPlanningSettings = {
        ...row,
        id: row.id ?? `settings-${settingsRows.length + 1}`,
        createdAt: row.createdAt ?? NOW,
        updatedAt: new Date(NOW.getTime() + settingsRows.length * 1000),
      };
      const index = settingsRows.findIndex((item) => item.id === saved.id);
      if (index >= 0) {
        settingsRows[index] = saved;
      } else {
        settingsRows.push(saved);
      }
      return saved;
    });
    goalsRepo.findOne.mockImplementation(async ({ where }) => {
      return (
        goalRows.find(
          (row) =>
            row.userId === where.userId &&
            (where.isActive === undefined || row.isActive === where.isActive) &&
            (!where.status || row.status === where.status),
        ) ?? null
      );
    });

    const module = await Test.createTestingModule({
      providers: [
        GoldPlanningService,
        { provide: GoldService, useValue: goldService },
        {
          provide: getRepositoryToken(GoldPlanningSettings),
          useValue: settingsRepo,
        },
        { provide: getRepositoryToken(GoldProfitGoal), useValue: goalsRepo },
      ],
    }).compile();
    service = module.get(GoldPlanningService);
  });

  it('returns null planning settings when none exist', async () => {
    await expect(service.getGoldPlanningSettings('user-a')).resolves.toBeNull();
  });

  it('sets and updates a monthly Gold budget for the JWT user', async () => {
    const created = await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 40000,
    });
    expect(created.monthlyBudgetCents).toBe(40000);
    const updated = await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 20000,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.monthlyBudgetCents).toBe(20000);
    expect(settingsRows).toHaveLength(1);
  });

  it('rejects a zero or negative budget', async () => {
    await expect(
      service.setGoldMonthlyBudget('user-a', { monthly_budget_cents: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setGoldMonthlyBudget('user-a', { monthly_budget_cents: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('isolates planning settings and decisions by user', async () => {
    await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 40000,
    });
    await service.setGoldMonthlyBudget('user-b', {
      monthly_budget_cents: 10000,
    });
    const mine = await service.getGoldPlanningSettings('user-a');
    const other = await service.getGoldPlanningSettings('user-b');
    expect(mine?.monthlyBudgetCents).toBe(40000);
    expect(other?.monthlyBudgetCents).toBe(10000);

    goldService.getGoldAnalyticsSource.mockImplementation(async (userId) => ({
      ...defaultSource,
      purchases: userId === 'user-a' ? defaultSource.purchases : [],
    }));
    const decisionA = await service.getGoldGoalDecision('user-a');
    const decisionB = await service.getGoldGoalDecision('user-b');
    expect(decisionA.monthlyBudgetCents).toBe(40000);
    expect(decisionB.monthlyBudgetCents).toBe(10000);
    expect(decisionA.hasHoldings).toBe(true);
    expect(decisionB.hasHoldings).toBe(false);
  });

  it('does not write purchases when computing a decision', async () => {
    await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 40000,
    });
    await service.getGoldGoalDecision('user-a');
    expect(goldService.getGoldAnalyticsSource).toHaveBeenCalledWith('user-a');
  });

  it('uses the active goal and recorded prices for goldGoalDecision', async () => {
    await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 40000,
    });
    goalRows.push({
      id: 'goal-1',
      userId: 'user-a',
      targetProfitCents: 40000,
      status: 'ACTIVE',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      achievedAt: null,
    } as GoldProfitGoal);
    const decision = await service.getGoldGoalDecision('user-a');
    expect(decision.hasActiveGoal).toBe(true);
    expect(decision.targetProfitCents).toBe(40000);
    expect(decision.currentPgSellCents).toBe(66000);
    expect(decision.scenarios).toHaveLength(4);
  });

  it('reuses the Phase 6A decision context for goldBudgetAllocationAnalysis', async () => {
    await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 40000,
    });
    goalRows.push({
      id: 'goal-1',
      userId: 'user-a',
      targetProfitCents: 40000,
      status: 'ACTIVE',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
      achievedAt: null,
    } as GoldProfitGoal);
    const analysis = await service.getGoldBudgetAllocationAnalysis('user-a');
    expect(analysis.monthlyBudgetCents).toBe(40000);
    expect(analysis.scenarios).toHaveLength(4);
    expect(analysis.recommendedAllocationCents).toBeLessThanOrEqual(40000);
    expect(goldService.getGoldAnalyticsSource).toHaveBeenCalledWith('user-a');
  });

  it('isolates budget allocation analysis by user', async () => {
    await service.setGoldMonthlyBudget('user-a', {
      monthly_budget_cents: 40000,
    });
    await service.setGoldMonthlyBudget('user-b', {
      monthly_budget_cents: 10000,
    });
    goalRows.push(
      {
        id: 'goal-a',
        userId: 'user-a',
        targetProfitCents: 40000,
        status: 'ACTIVE',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        achievedAt: null,
      } as GoldProfitGoal,
      {
        id: 'goal-b',
        userId: 'user-b',
        targetProfitCents: 20000,
        status: 'ACTIVE',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        achievedAt: null,
      } as GoldProfitGoal,
    );
    goldService.getGoldAnalyticsSource.mockImplementation(async (userId) => ({
      ...defaultSource,
      purchases: userId === 'user-a' ? defaultSource.purchases : [],
    }));
    const analysisA = await service.getGoldBudgetAllocationAnalysis('user-a');
    const analysisB = await service.getGoldBudgetAllocationAnalysis('user-b');
    expect(analysisA.monthlyBudgetCents).toBe(40000);
    expect(analysisB.monthlyBudgetCents).toBe(10000);
    expect(analysisA.isRankingAvailable).toBe(true);
    expect(analysisB.isRankingAvailable).toBe(false);
  });
});
