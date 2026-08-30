import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  EntityManager,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { CreateGoldPurchaseInput } from './dto/create-gold-purchase.input';
import { GoldPurchaseFilterInput } from './dto/gold-purchase-filter.input';
import { SetGoldPriceInput } from './dto/set-gold-price.input';
import { UpdateGoldPurchaseInput } from './dto/update-gold-purchase.input';
import {
  averageCostPerGramCents,
  derivePricePerGramCents,
  formatGramUnits,
  normalizeStoredWeightGrams,
  parseGramsToUnits,
  sumGramsStrings,
  valueCentsFromGramsAndUnitPrice,
} from './gold-math';
import { GoldPrice } from './gold-price.entity';
import { GoldPurchase, type GoldPurchaseSource } from './gold-purchase.entity';
import {
  GoldDashboardModel,
  GoldPriceModel,
  GoldPurchaseModel,
} from './models/gold.model';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MANUAL_SOURCE = 'MANUAL' as const;

export type CreateGoldPurchaseFields = {
  purchase_date: string;
  weight_grams: string;
  amount_paid_cents: number;
  price_per_gram_cents?: number;
  reference_number?: string;
  notes?: string;
};

@Injectable()
export class GoldService {
  constructor(
    @InjectRepository(GoldPurchase)
    private readonly purchasesRepo: Repository<GoldPurchase>,
    @InjectRepository(GoldPrice)
    private readonly pricesRepo: Repository<GoldPrice>,
  ) {}

  async getDashboard(userId: string): Promise<GoldDashboardModel> {
    const purchases = await this.purchasesRepo.find({
      where: { userId, isActive: true },
      order: { purchaseDate: 'DESC', createdAt: 'DESC' },
    });
    const latestPrice = await this.findLatestPriceEntity(userId);

    const totalInvestedCents = purchases.reduce(
      (sum, p) => sum + p.amountPaidCents,
      0,
    );
    const totalGrams =
      purchases.length === 0
        ? '0.0000'
        : sumGramsStrings(
            purchases.map((p) => normalizeStoredWeightGrams(p.weightGrams)),
          );

    const hasGrams = purchases.length > 0 && totalGrams !== '0.0000';
    const averageCost = hasGrams
      ? averageCostPerGramCents(totalInvestedCents, totalGrams)
      : 0;

    const hasPrice = latestPrice != null;
    let currentValueCents = 0;
    let unrealizedPlCents = 0;
    let unrealizedPlPercent = 0;

    if (hasPrice && hasGrams) {
      // CRITICAL: portfolio valuation uses PG BUY (liquidation).
      currentValueCents = valueCentsFromGramsAndUnitPrice(
        totalGrams,
        latestPrice.pgBuyPricePerGramCents,
      );
      unrealizedPlCents = currentValueCents - totalInvestedCents;
      if (totalInvestedCents > 0) {
        unrealizedPlPercent = (unrealizedPlCents / totalInvestedCents) * 100;
      }
    }

    return {
      totalGrams,
      totalInvestedCents,
      averageCostPerGramCents: averageCost,
      currentPgBuyPricePerGramCents: hasPrice
        ? latestPrice.pgBuyPricePerGramCents
        : null,
      currentPgSellPricePerGramCents: hasPrice
        ? latestPrice.pgSellPricePerGramCents
        : null,
      currentValueCents,
      unrealizedPlCents,
      unrealizedPlPercent,
      purchaseCount: purchases.length,
      priceAsOf: hasPrice ? latestPrice.priceDate : null,
      hasPrice,
    };
  }

  async findMyPurchases(
    userId: string,
    filter?: GoldPurchaseFilterInput,
  ): Promise<GoldPurchaseModel[]> {
    const f = filter ?? {};
    const limit = f.limit ?? 50;
    const offset = f.offset ?? 0;
    const sortNewest = (f.sort_order ?? 'NEWEST') !== 'OLDEST';

    const where: FindOptionsWhere<GoldPurchase> = {
      userId,
      isActive: true,
    };

    if (f.start_date && f.end_date) {
      this.requireDateString(f.start_date, 'start_date');
      this.requireDateString(f.end_date, 'end_date');
      if (f.start_date > f.end_date) {
        throw new BadRequestException(
          'start_date must be on or before end_date.',
        );
      }
      where.purchaseDate = Between(f.start_date, f.end_date);
    } else if (f.start_date) {
      this.requireDateString(f.start_date, 'start_date');
      where.purchaseDate = MoreThanOrEqual(f.start_date);
    } else if (f.end_date) {
      this.requireDateString(f.end_date, 'end_date');
      where.purchaseDate = LessThanOrEqual(f.end_date);
    }

    const rows = await this.purchasesRepo.find({
      where,
      order: {
        purchaseDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    const latestPrice = await this.findLatestPriceEntity(userId);
    return rows.map((row) => this.toPurchaseModel(row, latestPrice));
  }

  async findPurchaseById(
    userId: string,
    purchaseId: string,
  ): Promise<GoldPurchaseModel> {
    const row = await this.requireOwnedPurchase(userId, purchaseId);
    const latestPrice = await this.findLatestPriceEntity(userId);
    return this.toPurchaseModel(row, latestPrice);
  }

  async createPurchase(
    userId: string,
    input: CreateGoldPurchaseInput,
  ): Promise<GoldPurchaseModel> {
    const saved = await this.createPurchaseEntity(userId, input, MANUAL_SOURCE);
    const latestPrice = await this.findLatestPriceEntity(userId);
    return this.toPurchaseModel(saved, latestPrice);
  }

  /**
   * Creates a purchase row. When `manager` is supplied the caller owns the transaction.
   */
  async createPurchaseEntity(
    userId: string,
    input: CreateGoldPurchaseFields,
    source: GoldPurchaseSource,
    manager?: EntityManager,
  ): Promise<GoldPurchase> {
    const purchaseDate = this.requireDateString(
      input.purchase_date,
      'purchase_date',
    );
    const weightGrams = this.requireWeightGrams(input.weight_grams);
    const amountPaidCents = this.requirePositiveCents(
      input.amount_paid_cents,
      'amount_paid_cents',
    );

    let pricePerGramCents: number;
    if (input.price_per_gram_cents != null) {
      pricePerGramCents = this.requirePositiveCents(
        input.price_per_gram_cents,
        'price_per_gram_cents',
      );
    } else {
      pricePerGramCents = derivePricePerGramCents(amountPaidCents, weightGrams);
      if (pricePerGramCents < 1) {
        throw new BadRequestException(
          'Derived price_per_gram_cents must be at least 1.',
        );
      }
    }

    const row = this.purchasesRepo.create({
      userId,
      purchaseDate,
      weightGrams,
      amountPaidCents,
      pricePerGramCents,
      source,
      referenceNumber: input.reference_number?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: true,
    });

    if (manager) {
      return manager.save(GoldPurchase, row);
    }
    return this.purchasesRepo.save(row);
  }

  /** Advisory duplicate check — does not block import. */
  async findLogicalDuplicateWarnings(
    userId: string,
    purchaseDate: string,
    referenceNumber: string | null,
    excludePurchaseId?: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const ref = referenceNumber?.trim();
    if (!ref) {
      return [];
    }

    const repo = manager
      ? manager.getRepository(GoldPurchase)
      : this.purchasesRepo;
    const existing = await repo.findOne({
      where: {
        userId,
        purchaseDate,
        referenceNumber: ref,
        isActive: true,
      },
    });

    if (existing && existing.id !== excludePurchaseId) {
      return ['LOGICAL_DUPLICATE_REFERENCE'];
    }
    return [];
  }

  async updatePurchase(
    userId: string,
    purchaseId: string,
    input: UpdateGoldPurchaseInput,
  ): Promise<GoldPurchaseModel> {
    const row = await this.requireOwnedPurchase(userId, purchaseId);
    if (!row.isActive) {
      throw new BadRequestException('Cannot update an inactive gold purchase.');
    }

    if (input.purchase_date !== undefined) {
      row.purchaseDate = this.requireDateString(
        input.purchase_date,
        'purchase_date',
      );
    }
    if (input.weight_grams !== undefined) {
      row.weightGrams = this.requireWeightGrams(input.weight_grams);
    }
    if (input.amount_paid_cents !== undefined) {
      row.amountPaidCents = this.requirePositiveCents(
        input.amount_paid_cents,
        'amount_paid_cents',
      );
    }
    if (input.price_per_gram_cents !== undefined) {
      row.pricePerGramCents = this.requirePositiveCents(
        input.price_per_gram_cents,
        'price_per_gram_cents',
      );
    } else if (
      input.weight_grams !== undefined ||
      input.amount_paid_cents !== undefined
    ) {
      row.pricePerGramCents = derivePricePerGramCents(
        row.amountPaidCents,
        row.weightGrams,
      );
    }
    if (input.reference_number !== undefined) {
      row.referenceNumber =
        input.reference_number === null || input.reference_number === ''
          ? null
          : input.reference_number.trim();
    }
    if (input.notes !== undefined) {
      row.notes =
        input.notes === null || input.notes === '' ? null : input.notes.trim();
    }

    const saved = await this.purchasesRepo.save(row);
    const latestPrice = await this.findLatestPriceEntity(userId);
    return this.toPurchaseModel(saved, latestPrice);
  }

  async deletePurchase(userId: string, purchaseId: string): Promise<boolean> {
    const row = await this.requireOwnedPurchase(userId, purchaseId);
    if (!row.isActive) {
      return true;
    }
    row.isActive = false;
    await this.purchasesRepo.save(row);
    return true;
  }

  async latestGoldPrice(userId: string): Promise<GoldPriceModel | null> {
    const row = await this.findLatestPriceEntity(userId);
    return row ? this.toPriceModel(row) : null;
  }

  async setGoldPrice(
    userId: string,
    input: SetGoldPriceInput,
  ): Promise<GoldPriceModel> {
    const priceDate = this.requireDateString(input.price_date, 'price_date');
    const pgBuy = this.requirePositiveCents(
      input.pg_buy_price_per_gram_cents,
      'pg_buy_price_per_gram_cents',
    );
    const pgSell = this.requirePositiveCents(
      input.pg_sell_price_per_gram_cents,
      'pg_sell_price_per_gram_cents',
    );
    this.requireValidSpread(pgSell, pgBuy);

    const existing = await this.pricesRepo.findOne({
      where: {
        userId,
        priceDate,
        source: MANUAL_SOURCE,
      },
    });

    if (existing) {
      existing.pgBuyPricePerGramCents = pgBuy;
      existing.pgSellPricePerGramCents = pgSell;
      existing.notes = input.notes?.trim() || null;
      const saved = await this.pricesRepo.save(existing);
      return this.toPriceModel(saved);
    }

    const created = this.pricesRepo.create({
      userId,
      priceDate,
      pgBuyPricePerGramCents: pgBuy,
      pgSellPricePerGramCents: pgSell,
      source: MANUAL_SOURCE,
      notes: input.notes?.trim() || null,
    });
    const saved = await this.pricesRepo.save(created);
    return this.toPriceModel(saved);
  }

  // --- internals ---

  private async findLatestPriceEntity(
    userId: string,
  ): Promise<GoldPrice | null> {
    const today = this.todayDateString();
    return this.pricesRepo.findOne({
      where: {
        userId,
        priceDate: LessThanOrEqual(today),
      },
      order: { priceDate: 'DESC', createdAt: 'DESC' },
    });
  }

  private todayDateString(): string {
    // Calendar date in local process TZ; production should run Asia/Kuala_Lumpur.
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async requireOwnedPurchase(
    userId: string,
    purchaseId: string,
  ): Promise<GoldPurchase> {
    const row = await this.purchasesRepo.findOne({ where: { id: purchaseId } });
    if (!row) {
      throw new NotFoundException('Gold purchase not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this gold purchase.');
    }
    return row;
  }

  private requireDateString(value: string, field: string): string {
    if (!DATE_RE.test(value)) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD.`);
    }
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    ) {
      throw new BadRequestException(`${field} is not a valid calendar date.`);
    }
    return value;
  }

  private requireWeightGrams(raw: string): string {
    const trimmed = raw.trim();
    try {
      const units = parseGramsToUnits(trimmed);
      if (units <= 0n) {
        throw new BadRequestException(
          'weight_grams must be greater than zero.',
        );
      }
      return formatGramUnits(units);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException(
        'weight_grams must be a positive number with up to 4 decimal places.',
      );
    }
  }

  private requirePositiveCents(value: number, field: string): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`${field} must be an integer >= 1.`);
    }
    return value;
  }

  /**
   * PG SELL (customer pays) must be >= PG BUY (customer receives on liquidation).
   */
  private requireValidSpread(pgSell: number, pgBuy: number): void {
    if (pgSell < pgBuy) {
      throw new BadRequestException(
        'pg_sell_price_per_gram_cents must be greater than or equal to pg_buy_price_per_gram_cents.',
      );
    }
  }

  private toPurchaseModel(
    row: GoldPurchase,
    latestPrice: GoldPrice | null,
  ): GoldPurchaseModel {
    let currentValueCents: number | null = null;
    let unrealizedPlCents: number | null = null;
    if (latestPrice && row.isActive) {
      currentValueCents = valueCentsFromGramsAndUnitPrice(
        normalizeStoredWeightGrams(row.weightGrams),
        latestPrice.pgBuyPricePerGramCents,
      );
      unrealizedPlCents = currentValueCents - row.amountPaidCents;
    }
    return {
      id: row.id,
      userId: row.userId,
      purchaseDate: this.normalizeDate(row.purchaseDate),
      weightGrams: normalizeStoredWeightGrams(row.weightGrams),
      amountPaidCents: row.amountPaidCents,
      pricePerGramCents: row.pricePerGramCents,
      source: row.source,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      isActive: row.isActive,
      currentValueCents,
      unrealizedPlCents,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPriceModel(row: GoldPrice): GoldPriceModel {
    return {
      id: row.id,
      userId: row.userId,
      priceDate: this.normalizeDate(row.priceDate),
      pgBuyPricePerGramCents: row.pgBuyPricePerGramCents,
      pgSellPricePerGramCents: row.pgSellPricePerGramCents,
      source: row.source,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** TypeORM may return Date for `date` columns depending on driver config. */
  private normalizeDate(value: string | Date): string {
    if (value instanceof Date) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
  }
}
