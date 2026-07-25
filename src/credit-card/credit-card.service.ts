import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { AccountService } from '../account/account.service';
import { CardNetwork, CreditCard } from './credit-card.entity';
import { CreateCreditCardInput, CARD_NETWORKS } from './dto/create-credit-card.input';
import { UpdateCreditCardInput } from './dto/update-credit-card.input';
import { CreditCardModel } from './models/credit-card.model';

@Injectable()
export class CreditCardService {
  constructor(
    @InjectRepository(CreditCard)
    private readonly creditCardsRepo: Repository<CreditCard>,
    private readonly accountService: AccountService,
  ) {}

  async findMyCreditCards(userId: string): Promise<CreditCardModel[]> {
    const rows = await this.creditCardsRepo.find({
      where: { userId },
      order: { cardName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findActiveCreditCards(userId: string): Promise<CreditCardModel[]> {
    const rows = await this.creditCardsRepo.find({
      where: { userId, isActive: true },
      order: { cardName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    creditCardId: string,
  ): Promise<CreditCardModel> {
    const row = await this.requireOwnedCard(userId, creditCardId);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateCreditCardInput,
  ): Promise<CreditCardModel> {
    const cardName = this.normalizeName(input.card_name, 'Card name');
    const bankName = this.normalizeName(input.bank_name, 'Bank name');
    const cardNetwork = this.requireCardNetwork(input.card_network);
    const lastFourDigits = this.requireLastFour(input.last_four_digits);
    const creditLimitCents = this.requirePositiveLimit(input.credit_limit_cents);
    const outstandingBalanceCents = this.requireNonNegativeOutstanding(
      input.outstanding_balance_cents ?? 0,
    );
    const statementDay = this.requireDay(input.statement_day, 'Statement day');
    const paymentDueDay = this.requireDay(
      input.payment_due_day,
      'Payment due day',
    );

    this.assertOutstandingWithinLimit(
      creditLimitCents,
      outstandingBalanceCents,
    );

    await this.assertUniqueCardName(userId, cardName);
    await this.assertUniqueBankLastFour(userId, bankName, lastFourDigits);

    const accountId = await this.resolveOptionalAccountId(
      userId,
      input.account_id,
    );

    const entity = this.creditCardsRepo.create({
      userId,
      accountId,
      cardName,
      bankName,
      cardNetwork,
      lastFourDigits,
      creditLimitCents,
      outstandingBalanceCents,
      availableLimitCents: creditLimitCents - outstandingBalanceCents,
      statementDay,
      paymentDueDay,
      currency: (input.currency ?? 'MYR').toUpperCase(),
      isActive: true,
    });

    const saved = await this.creditCardsRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    creditCardId: string,
    input: UpdateCreditCardInput,
  ): Promise<CreditCardModel> {
    const card = await this.requireOwnedCard(userId, creditCardId);

    const nextCardName =
      input.card_name !== undefined
        ? this.normalizeName(input.card_name, 'Card name')
        : card.cardName;
    const nextBankName =
      input.bank_name !== undefined
        ? this.normalizeName(input.bank_name, 'Bank name')
        : card.bankName;
    const nextLastFour =
      input.last_four_digits !== undefined
        ? this.requireLastFour(input.last_four_digits)
        : card.lastFourDigits;
    const nextCreditLimit =
      input.credit_limit_cents !== undefined
        ? this.requirePositiveLimit(input.credit_limit_cents)
        : card.creditLimitCents;
    const nextOutstanding =
      input.outstanding_balance_cents !== undefined
        ? this.requireNonNegativeOutstanding(input.outstanding_balance_cents)
        : card.outstandingBalanceCents;

    this.assertOutstandingWithinLimit(nextCreditLimit, nextOutstanding);

    if (input.card_name !== undefined) {
      await this.assertUniqueCardName(userId, nextCardName, creditCardId);
      card.cardName = nextCardName;
    }
    if (input.bank_name !== undefined || input.last_four_digits !== undefined) {
      await this.assertUniqueBankLastFour(
        userId,
        nextBankName,
        nextLastFour,
        creditCardId,
      );
      card.bankName = nextBankName;
      card.lastFourDigits = nextLastFour;
    }
    if (input.card_network !== undefined) {
      card.cardNetwork = this.requireCardNetwork(input.card_network);
    }
    if (input.credit_limit_cents !== undefined) {
      card.creditLimitCents = nextCreditLimit;
    }
    if (input.outstanding_balance_cents !== undefined) {
      card.outstandingBalanceCents = nextOutstanding;
    }
    if (
      input.credit_limit_cents !== undefined ||
      input.outstanding_balance_cents !== undefined
    ) {
      card.availableLimitCents =
        card.creditLimitCents - card.outstandingBalanceCents;
    }
    if (input.statement_day !== undefined) {
      card.statementDay = this.requireDay(input.statement_day, 'Statement day');
    }
    if (input.payment_due_day !== undefined) {
      card.paymentDueDay = this.requireDay(
        input.payment_due_day,
        'Payment due day',
      );
    }
    if (input.currency !== undefined) {
      card.currency = input.currency.toUpperCase();
    }
    if (input.account_id !== undefined) {
      card.accountId = await this.resolveOptionalAccountId(
        userId,
        input.account_id,
      );
    }

    const saved = await this.creditCardsRepo.save(card);
    return this.toModel(saved);
  }

  async archive(
    userId: string,
    creditCardId: string,
  ): Promise<CreditCardModel> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    card.isActive = false;
    const saved = await this.creditCardsRepo.save(card);
    return this.toModel(saved);
  }

  async delete(userId: string, creditCardId: string): Promise<boolean> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    await this.creditCardsRepo.remove(card);
    return true;
  }

  /**
   * Apply a payment against outstanding balance.
   * Positive `paymentAmountCents` reduces outstanding and increases available credit.
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async applyPayment(
    userId: string,
    creditCardId: string,
    paymentAmountCents: number,
    manager?: EntityManager,
  ): Promise<CreditCardModel> {
    if (!Number.isInteger(paymentAmountCents) || paymentAmountCents <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const run = async (mgr: EntityManager): Promise<CreditCard> => {
      const cardRepo = mgr.getRepository(CreditCard);
      const card = await cardRepo.findOne({ where: { id: creditCardId } });
      if (!card) {
        throw new NotFoundException('Credit card not found.');
      }
      if (card.userId !== userId) {
        throw new ForbiddenException('You do not own this credit card.');
      }
      if (paymentAmountCents > card.outstandingBalanceCents) {
        throw new BadRequestException(
          'Payment amount cannot exceed outstanding balance.',
        );
      }

      card.outstandingBalanceCents -= paymentAmountCents;
      card.availableLimitCents =
        card.creditLimitCents - card.outstandingBalanceCents;
      return cardRepo.save(card);
    };

    const saved = manager
      ? await run(manager)
      : await this.creditCardsRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  /**
   * Reverse a previously applied payment (restore outstanding, reduce available).
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async reversePayment(
    userId: string,
    creditCardId: string,
    paymentAmountCents: number,
    manager?: EntityManager,
  ): Promise<CreditCardModel> {
    if (!Number.isInteger(paymentAmountCents) || paymentAmountCents <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const run = async (mgr: EntityManager): Promise<CreditCard> => {
      const cardRepo = mgr.getRepository(CreditCard);
      const card = await cardRepo.findOne({ where: { id: creditCardId } });
      if (!card) {
        throw new NotFoundException('Credit card not found.');
      }
      if (card.userId !== userId) {
        throw new ForbiddenException('You do not own this credit card.');
      }

      const nextOutstanding =
        card.outstandingBalanceCents + paymentAmountCents;
      if (nextOutstanding > card.creditLimitCents) {
        throw new BadRequestException(
          'Restoring this payment would exceed the credit limit.',
        );
      }

      card.outstandingBalanceCents = nextOutstanding;
      card.availableLimitCents =
        card.creditLimitCents - card.outstandingBalanceCents;
      return cardRepo.save(card);
    };

    const saved = manager
      ? await run(manager)
      : await this.creditCardsRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  private async requireOwnedCard(
    userId: string,
    creditCardId: string,
  ): Promise<CreditCard> {
    const card = await this.creditCardsRepo.findOne({
      where: { id: creditCardId },
    });
    if (!card) {
      throw new NotFoundException('Credit card not found.');
    }
    if (card.userId !== userId) {
      throw new ForbiddenException('You do not own this credit card.');
    }
    return card;
  }

  private async resolveOptionalAccountId(
    userId: string,
    accountId?: string | null,
  ): Promise<string | null> {
    if (accountId === undefined || accountId === null) {
      return null;
    }
    await this.accountService.findByIdForUser(userId, accountId);
    return accountId;
  }

  private async assertUniqueCardName(
    userId: string,
    cardName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.creditCardsRepo.findOne({
      where: excludeId
        ? { userId, cardName, id: Not(excludeId) }
        : { userId, cardName },
    });
    if (existing) {
      throw new BadRequestException(
        'A credit card with this name already exists.',
      );
    }
  }

  private async assertUniqueBankLastFour(
    userId: string,
    bankName: string,
    lastFourDigits: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.creditCardsRepo.findOne({
      where: excludeId
        ? { userId, bankName, lastFourDigits, id: Not(excludeId) }
        : { userId, bankName, lastFourDigits },
    });
    if (existing) {
      throw new BadRequestException(
        'A credit card with these last four digits already exists for this bank.',
      );
    }
  }

  private assertOutstandingWithinLimit(
    creditLimitCents: number,
    outstandingBalanceCents: number,
  ): void {
    if (outstandingBalanceCents > creditLimitCents) {
      throw new BadRequestException(
        'Outstanding balance cannot exceed credit limit.',
      );
    }
  }

  private requirePositiveLimit(value: number): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('Credit limit must be greater than zero.');
    }
    return value;
  }

  private requireNonNegativeOutstanding(value: number): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        'Outstanding balance cannot be negative.',
      );
    }
    return value;
  }

  private requireDay(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      throw new BadRequestException(`${label} must be between 1 and 31.`);
    }
    return value;
  }

  private requireLastFour(value: string): string {
    const trimmed = value.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      throw new BadRequestException('Last four digits must be exactly 4 digits.');
    }
    return trimmed;
  }

  private requireCardNetwork(network: string): CardNetwork {
    if (!CARD_NETWORKS.includes(network as (typeof CARD_NETWORKS)[number])) {
      throw new BadRequestException('Invalid card network.');
    }
    return network as CardNetwork;
  }

  private normalizeName(name: string, label: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed;
  }

  private toModel(row: CreditCard): CreditCardModel {
    return {
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      cardName: row.cardName,
      bankName: row.bankName,
      cardNetwork: row.cardNetwork,
      lastFourDigits: row.lastFourDigits,
      creditLimitCents: row.creditLimitCents,
      availableLimitCents: row.availableLimitCents,
      outstandingBalanceCents: row.outstandingBalanceCents,
      statementDay: row.statementDay,
      paymentDueDay: row.paymentDueDay,
      currency: row.currency,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as CreditCardModel;
  }
}
