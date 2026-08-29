import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoldPrice } from './gold-price.entity';
import { GoldPurchase } from './gold-purchase.entity';
import { GoldService } from './gold.service';

describe('GoldService', () => {
  let service: GoldService;
  let purchasesRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let pricesRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const now = new Date('2026-08-29T00:00:00.000Z');

  const purchase = (overrides: Partial<GoldPurchase> = {}): GoldPurchase =>
    ({
      id: 'gp-1',
      userId: 'user-a',
      purchaseDate: '2026-08-01',
      weightGrams: '10.000',
      amountPaidCents: 500000,
      pricePerGramCents: 50000,
      source: 'MANUAL',
      referenceNumber: null,
      notes: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }) as GoldPurchase;

  const price = (overrides: Partial<GoldPrice> = {}): GoldPrice =>
    ({
      id: 'price-1',
      userId: 'user-a',
      priceDate: '2026-08-29',
      pgBuyPricePerGramCents: 52000,
      pgSellPricePerGramCents: 54000,
      source: 'MANUAL',
      notes: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }) as GoldPrice;

  beforeEach(async () => {
    purchasesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x: Partial<GoldPurchase>) => x as GoldPurchase),
      save: jest.fn(async (x: GoldPurchase) => ({
        ...x,
        id: x.id ?? 'gp-new',
        createdAt: x.createdAt ?? now,
        updatedAt: now,
      })),
    };
    pricesRepo = {
      findOne: jest.fn(),
      create: jest.fn((x: Partial<GoldPrice>) => x as GoldPrice),
      save: jest.fn(async (x: GoldPrice) => ({
        ...x,
        id: x.id ?? 'price-new',
        createdAt: x.createdAt ?? now,
        updatedAt: now,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldService,
        { provide: getRepositoryToken(GoldPurchase), useValue: purchasesRepo },
        { provide: getRepositoryToken(GoldPrice), useValue: pricesRepo },
      ],
    }).compile();

    service = module.get(GoldService);

    // Freeze "today" for latest-price filter via prototype spy.
    jest
      .spyOn(
        service as unknown as { todayDateString: () => string },
        'todayDateString',
      )
      .mockReturnValue('2026-08-29');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getDashboard', () => {
    it('Test A — empty portfolio returns zeros without crashing', async () => {
      purchasesRepo.find.mockResolvedValue([]);
      pricesRepo.findOne.mockResolvedValue(null);

      const dash = await service.getDashboard('user-a');

      expect(dash.totalGrams).toBe('0.000');
      expect(dash.totalInvestedCents).toBe(0);
      expect(dash.averageCostPerGramCents).toBe(0);
      expect(dash.currentValueCents).toBe(0);
      expect(dash.unrealizedPlCents).toBe(0);
      expect(dash.unrealizedPlPercent).toBe(0);
      expect(dash.purchaseCount).toBe(0);
      expect(dash.hasPrice).toBe(false);
      expect(dash.priceAsOf).toBeNull();
    });

    it('Test B — purchases with no price: invested set, value/P/L = 0', async () => {
      purchasesRepo.find.mockResolvedValue([
        purchase({ id: 'a', weightGrams: '10.000', amountPaidCents: 500000 }),
        purchase({
          id: 'b',
          weightGrams: '5.000',
          amountPaidCents: 240000,
          pricePerGramCents: 48000,
        }),
      ]);
      pricesRepo.findOne.mockResolvedValue(null);

      const dash = await service.getDashboard('user-a');

      expect(dash.totalGrams).toBe('15.000');
      expect(dash.totalInvestedCents).toBe(740000);
      expect(dash.averageCostPerGramCents).toBe(49333);
      expect(dash.hasPrice).toBe(false);
      expect(dash.currentValueCents).toBe(0);
      expect(dash.unrealizedPlCents).toBe(0);
      expect(dash.unrealizedPlPercent).toBe(0);
      expect(dash.purchaseCount).toBe(2);
    });

    it('Test C — fixture uses PG BUY (52000), not PG SELL (54000)', async () => {
      purchasesRepo.find.mockResolvedValue([
        purchase({ id: 'a', weightGrams: '10.000', amountPaidCents: 500000 }),
        purchase({
          id: 'b',
          weightGrams: '5.000',
          amountPaidCents: 240000,
          pricePerGramCents: 48000,
        }),
      ]);
      pricesRepo.findOne.mockResolvedValue(
        price({
          pgBuyPricePerGramCents: 52000,
          pgSellPricePerGramCents: 54000,
        }),
      );

      const dash = await service.getDashboard('user-a');

      expect(dash.totalGrams).toBe('15.000');
      expect(dash.totalInvestedCents).toBe(740000);
      expect(dash.averageCostPerGramCents).toBe(49333);
      expect(dash.hasPrice).toBe(true);
      expect(dash.currentPgBuyPricePerGramCents).toBe(52000);
      expect(dash.currentPgSellPricePerGramCents).toBe(54000);
      // 15 × 52000 = 780000 (PG BUY). Must NOT be 15 × 54000 = 810000.
      expect(dash.currentValueCents).toBe(780000);
      expect(dash.currentValueCents).not.toBe(810000);
      expect(dash.unrealizedPlCents).toBe(40000);
      expect(dash.unrealizedPlPercent).toBeCloseTo(5.405405, 4);
    });

    it('Test D — soft-deleted purchase excluded from totals', async () => {
      purchasesRepo.find.mockResolvedValue([
        purchase({
          id: 'active',
          weightGrams: '10.000',
          amountPaidCents: 500000,
        }),
      ]);
      // find only returns isActive:true in service where-clause; inactive not returned.
      pricesRepo.findOne.mockResolvedValue(
        price({
          pgBuyPricePerGramCents: 52000,
          pgSellPricePerGramCents: 54000,
        }),
      );

      const dash = await service.getDashboard('user-a');
      expect(dash.purchaseCount).toBe(1);
      expect(dash.totalGrams).toBe('10.000');
      expect(dash.totalInvestedCents).toBe(500000);
    });
  });

  describe('setGoldPrice', () => {
    it('Test E — rejects PG SELL < PG BUY', async () => {
      await expect(
        service.setGoldPrice('user-a', {
          price_date: '2026-08-29',
          pg_buy_price_per_gram_cents: 58000,
          pg_sell_price_per_gram_cents: 56000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pricesRepo.save).not.toHaveBeenCalled();
    });

    it('Test H — upserts MANUAL price for same user/date', async () => {
      const existing = price({
        id: 'price-1',
        pgBuyPricePerGramCents: 50000,
        pgSellPricePerGramCents: 53000,
      });
      pricesRepo.findOne.mockResolvedValue(existing);

      const result = await service.setGoldPrice('user-a', {
        price_date: '2026-08-29',
        pg_buy_price_per_gram_cents: 52000,
        pg_sell_price_per_gram_cents: 54000,
        notes: 'updated',
      });

      expect(pricesRepo.create).not.toHaveBeenCalled();
      expect(pricesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'price-1',
          pgBuyPricePerGramCents: 52000,
          pgSellPricePerGramCents: 54000,
          notes: 'updated',
        }),
      );
      expect(result.pgBuyPricePerGramCents).toBe(52000);
      expect(result.pgSellPricePerGramCents).toBe(54000);
    });

    it('creates a new MANUAL price when none exists', async () => {
      pricesRepo.findOne.mockResolvedValue(null);

      await service.setGoldPrice('user-a', {
        price_date: '2026-08-29',
        pg_buy_price_per_gram_cents: 57200,
        pg_sell_price_per_gram_cents: 62900,
      });

      expect(pricesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-a',
          priceDate: '2026-08-29',
          source: 'MANUAL',
          pgBuyPricePerGramCents: 57200,
          pgSellPricePerGramCents: 62900,
        }),
      );
    });
  });

  describe('createPurchase validation', () => {
    it('Test F — rejects zero/negative amount and weight', async () => {
      await expect(
        service.createPurchase('user-a', {
          purchase_date: '2026-08-01',
          weight_grams: '10.000',
          amount_paid_cents: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createPurchase('user-a', {
          purchase_date: '2026-08-01',
          weight_grams: '0',
          amount_paid_cents: 1000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createPurchase('user-a', {
          purchase_date: '2026-08-01',
          weight_grams: '-1.000',
          amount_paid_cents: 1000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('derives price_per_gram_cents when omitted', async () => {
      pricesRepo.findOne.mockResolvedValue(null);

      await service.createPurchase('user-a', {
        purchase_date: '2026-08-01',
        weight_grams: '10.000',
        amount_paid_cents: 500000,
      });

      expect(purchasesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          weightGrams: '10.000',
          amountPaidCents: 500000,
          pricePerGramCents: 50000,
          source: 'MANUAL',
          isActive: true,
        }),
      );
    });
  });

  describe('ownership', () => {
    it('Test G — User A cannot retrieve User B purchase', async () => {
      purchasesRepo.findOne.mockResolvedValue(
        purchase({ id: 'gp-b', userId: 'user-b' }),
      );

      await expect(
        service.findPurchaseById('user-a', 'gp-b'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Test G — missing purchase is NotFound', async () => {
      purchasesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findPurchaseById('user-a', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Test G — User A cannot update User B purchase', async () => {
      purchasesRepo.findOne.mockResolvedValue(
        purchase({ id: 'gp-b', userId: 'user-b' }),
      );
      await expect(
        service.updatePurchase('user-a', 'gp-b', { notes: 'hack' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Test G — User A cannot delete User B purchase', async () => {
      purchasesRepo.findOne.mockResolvedValue(
        purchase({ id: 'gp-b', userId: 'user-b' }),
      );
      await expect(
        service.deletePurchase('user-a', 'gp-b'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('deletePurchase', () => {
    it('soft-deletes by setting is_active false', async () => {
      const row = purchase({ id: 'gp-1', isActive: true });
      purchasesRepo.findOne.mockResolvedValue(row);

      const ok = await service.deletePurchase('user-a', 'gp-1');
      expect(ok).toBe(true);
      expect(purchasesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'gp-1', isActive: false }),
      );
    });
  });
});
