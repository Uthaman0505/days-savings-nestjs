import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoldProfitGoal } from './gold-profit-goal.entity';
import { GoldProfitGoalService } from './gold-profit-goal.service';
import { GoldService } from './gold.service';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';

const NOW = new Date('2026-09-05T02:00:00.000Z');

function purchase(
  partial: Partial<GoldPurchaseObservation> & { id: string },
): GoldPurchaseObservation {
  return {
    purchaseDate: '2026-08-30',
    weightGrams: '1.0000',
    amountPaidCents: 50000,
    pricePerGramCents: 50000,
    source: 'MANUAL',
    referenceNumber: null,
    createdAt: NOW,
    isActive: true,
    ...partial,
  };
}

describe('GoldProfitGoalService', () => {
  let service: GoldProfitGoalService;
  const rows: GoldProfitGoal[] = [];
  const goldService = {
    getGoldAnalyticsSource: jest.fn(),
  };
  const goalsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const defaultSource = {
    purchases: [
      purchase({ id: 'a', amountPaidCents: 50000, weightGrams: '1.0000' }),
      purchase({
        id: 'b',
        amountPaidCents: 30000,
        weightGrams: '0.5000',
        source: 'IMPORT',
      }),
    ],
    prices: [],
    latestPrice: {
      pgBuyPricePerGramCents: 57300,
      pgSellPricePerGramCents: 62500,
      priceDate: '2026-09-05',
    },
    todayPriceDate: '2026-09-05',
  };

  beforeEach(async () => {
    rows.length = 0;
    goldService.getGoldAnalyticsSource.mockReset();
    goldService.getGoldAnalyticsSource.mockResolvedValue(defaultSource);
    goalsRepo.findOne.mockReset();
    goalsRepo.create.mockReset();
    goalsRepo.save.mockReset();
    goalsRepo.findOne.mockImplementation(async ({ where }) => {
      return (
        rows.find(
          (row) =>
            row.userId === where.userId &&
            row.isActive === where.isActive &&
            row.status === where.status,
        ) ?? null
      );
    });
    goalsRepo.create.mockImplementation((input: Partial<GoldProfitGoal>) => ({
      ...input,
    }));
    goalsRepo.save.mockImplementation(async (row: GoldProfitGoal) => {
      const saved: GoldProfitGoal = {
        ...row,
        id: row.id ?? `goal-${rows.length + 1}`,
        createdAt: row.createdAt ?? NOW,
        updatedAt: NOW,
      };
      const index = rows.findIndex((item) => item.id === saved.id);
      if (index >= 0) {
        rows[index] = saved;
      } else {
        rows.push(saved);
      }
      return saved;
    });

    const module = await Test.createTestingModule({
      providers: [
        GoldProfitGoalService,
        { provide: GoldService, useValue: goldService },
        { provide: getRepositoryToken(GoldProfitGoal), useValue: goalsRepo },
      ],
    }).compile();
    service = module.get(GoldProfitGoalService);
  });

  it('returns null when the user has no active goal', async () => {
    await expect(service.getGoldProfitGoal('user-a')).resolves.toBeNull();
    expect(goldService.getGoldAnalyticsSource).not.toHaveBeenCalled();
  });

  it('sets a new profit goal for the JWT user', async () => {
    const status = await service.setGoldProfitGoal('user-a', {
      target_profit_cents: 40000,
    });
    expect(status.goal.targetProfitCents).toBe(40000);
    expect(status.goal.status).toBe('ACTIVE');
    expect(status.goal.isActive).toBe(true);
    expect(status.protectedCapitalCents).toBe(80000);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('user-a');
  });

  it('edits the active goal amount without creating a second active row', async () => {
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    const updated = await service.setGoldProfitGoal('user-a', {
      target_profit_cents: 50000,
    });
    expect(updated.goal.targetProfitCents).toBe(50000);
    expect(updated.requiredPortfolioValueCents).toBe(130000);
    expect(rows.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it('cancels the active goal without deleting the row or changing finances', async () => {
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    await expect(service.cancelGoldProfitGoal('user-a')).resolves.toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('CANCELLED');
    expect(rows[0].isActive).toBe(false);
    expect(rows[0].targetProfitCents).toBe(40000);
    await expect(service.getGoldProfitGoal('user-a')).resolves.toBeNull();
  });

  it('allows a new active goal after cancellation and keeps the cancelled row', async () => {
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    await service.cancelGoldProfitGoal('user-a');
    const next = await service.setGoldProfitGoal('user-a', {
      target_profit_cents: 25000,
    });
    expect(next.goal.targetProfitCents).toBe(25000);
    expect(next.goal.status).toBe('ACTIVE');
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === 'CANCELLED')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
  });

  it('rejects a non-positive target', async () => {
    await expect(
      service.setGoldProfitGoal('user-a', { target_profit_cents: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setGoldProfitGoal('user-a', { target_profit_cents: -100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('throws when cancelling with no active goal', async () => {
    await expect(service.cancelGoldProfitGoal('user-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('isolates goals and holdings by user', async () => {
    goldService.getGoldAnalyticsSource.mockImplementation(
      async (userId: string) => {
        if (userId !== 'user-a') {
          return {
            purchases: [],
            prices: [],
            latestPrice: null,
            todayPriceDate: '2026-09-05',
          };
        }
        return defaultSource;
      },
    );
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    const mine = await service.getGoldProfitGoal('user-a');
    const other = await service.getGoldProfitGoal('user-b');
    expect(mine?.protectedCapitalCents).toBe(80000);
    expect(other).toBeNull();
    expect(goldService.getGoldAnalyticsSource).toHaveBeenCalledWith('user-a');
  });

  it('does not auto-transition status when the target is reached', async () => {
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      ...defaultSource,
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: {
        pgBuyPricePerGramCents: 80000,
        pgSellPricePerGramCents: 85000,
        priceDate: '2026-09-05',
      },
    });
    const status = await service.setGoldProfitGoal('user-a', {
      target_profit_cents: 40000,
    });
    expect(status.isTargetReached).toBe(true);
    expect(status.goal.status).toBe('ACTIVE');
    expect(status.goal.achievedAt).toBeNull();
    expect(status.progressPercent).toBe(100);
  });

  it('recomputes after document delete (inactive) and restore', async () => {
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      ...defaultSource,
      purchases: [
        purchase({ id: 'a', amountPaidCents: 50000, weightGrams: '1.0000' }),
      ],
    });
    const afterDelete = await service.getGoldProfitGoal('user-a');
    expect(afterDelete?.protectedCapitalCents).toBe(50000);

    goldService.getGoldAnalyticsSource.mockResolvedValue(defaultSource);
    const afterRestore = await service.getGoldProfitGoal('user-a');
    expect(afterRestore?.protectedCapitalCents).toBe(80000);
  });

  it('recomputes after a new purchase and a new confirmed PG BUY', async () => {
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      ...defaultSource,
      purchases: [
        ...defaultSource.purchases,
        purchase({
          id: 'c',
          amountPaidCents: 10000,
          weightGrams: '0.1745',
        }),
      ],
    });
    const afterPurchase = await service.getGoldProfitGoal('user-a');
    expect(afterPurchase?.protectedCapitalCents).toBe(90000);

    goldService.getGoldAnalyticsSource.mockResolvedValue({
      ...defaultSource,
      latestPrice: {
        pgBuyPricePerGramCents: 80000,
        pgSellPricePerGramCents: 85000,
        priceDate: '2026-09-08',
      },
    });
    const afterPrice = await service.getGoldProfitGoal('user-a');
    expect(afterPrice?.currentPgBuyPerGramCents).toBe(80000);
    expect(afterPrice?.currentValueCents).toBe(120000);
    expect(afterPrice?.availableProfitCents).toBe(40000);
    expect(afterPrice?.isTargetReached).toBe(true);
  });

  it('returns a TARGET profit-taking preview without writing sales', async () => {
    goldService.getGoldAnalyticsSource.mockResolvedValue({
      ...defaultSource,
      purchases: [
        purchase({ id: 'a', amountPaidCents: 100000, weightGrams: '2.0000' }),
      ],
      latestPrice: {
        pgBuyPricePerGramCents: 70000,
        pgSellPricePerGramCents: 75000,
        priceDate: '2026-09-05',
      },
    });
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    const saveCount = goalsRepo.save.mock.calls.length;
    const preview = await service.getGoldProfitTakingPreview('user-a', {
      mode: 'TARGET',
    });
    expect(preview.isPreviewAllowed).toBe(true);
    expect(preview.executableGramsToSell).toBe('0.5714');
    expect(preview.estimatedSaleProceedsCents).toBe(39998);
    expect(goalsRepo.save.mock.calls.length).toBe(saveCount);
  });

  it('isolates profit-taking preview by user and respects cancel/edit', async () => {
    goldService.getGoldAnalyticsSource.mockImplementation(
      async (userId: string) => {
        if (userId !== 'user-a') {
          return {
            purchases: [],
            prices: [],
            latestPrice: null,
            todayPriceDate: '2026-09-05',
          };
        }
        return {
          ...defaultSource,
          purchases: [
            purchase({
              id: 'a',
              amountPaidCents: 100000,
              weightGrams: '2.0000',
            }),
          ],
          latestPrice: {
            pgBuyPricePerGramCents: 70000,
            pgSellPricePerGramCents: 75000,
            priceDate: '2026-09-05',
          },
        };
      },
    );
    await service.setGoldProfitGoal('user-a', { target_profit_cents: 40000 });
    const mine = await service.getGoldProfitTakingPreview('user-a', {
      mode: 'TARGET',
    });
    const other = await service.getGoldProfitTakingPreview('user-b', {
      mode: 'TARGET',
    });
    expect(mine.isPreviewAllowed).toBe(true);
    expect(other.blockingReason).toBe('NO_ACTIVE_GOAL');

    await service.setGoldProfitGoal('user-a', { target_profit_cents: 50000 });
    const edited = await service.getGoldProfitTakingPreview('user-a', {
      mode: 'TARGET',
    });
    expect(edited.requestedProfitCents).toBe(50000);
    expect(edited.blockingReason).toBe('TARGET_NOT_REACHED');

    await service.cancelGoldProfitGoal('user-a');
    const cancelled = await service.getGoldProfitTakingPreview('user-a', {
      mode: 'TARGET',
    });
    expect(cancelled.blockingReason).toBe('NO_ACTIVE_GOAL');
  });
});
