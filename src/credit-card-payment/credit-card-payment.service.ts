import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { CreditCardService } from '../credit-card/credit-card.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  CreateCreditCardPaymentInput,
  CREDIT_CARD_PAYMENT_METHODS,
} from './dto/create-credit-card-payment.input';
import { CreditCardPaymentFilterInput } from './dto/credit-card-payment-filter.input';
import { UpdateCreditCardPaymentInput } from './dto/update-credit-card-payment.input';
import {
  CreditCardPayment,
  CreditCardPaymentMethod,
} from './credit-card-payment.entity';
import { CreditCardPaymentModel } from './models/credit-card-payment.model';

@Injectable()
export class CreditCardPaymentService {
  constructor(
    @InjectRepository(CreditCardPayment)
    private readonly paymentsRepo: Repository<CreditCardPayment>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly creditCardService: CreditCardService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyPayments(
    userId: string,
    filter?: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    return this.queryPayments(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    paymentId: string,
  ): Promise<CreditCardPaymentModel> {
    const row = await this.requireOwnedPayment(userId, paymentId);
    return this.toModel(row);
  }

  async findByCard(
    userId: string,
    creditCardId: string,
    filter?: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    await this.creditCardService.findByIdForUser(userId, creditCardId);
    return this.queryPayments(userId, {
      ...filter,
      credit_card_id: creditCardId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is required.');
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is required.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
    return this.queryPayments(userId, {
      ...filter,
      start_date: startDate,
      end_date: endDate,
    });
  }

  async create(
    userId: string,
    input: CreateCreditCardPaymentInput,
  ): Promise<CreditCardPaymentModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const paymentDate = this.requirePaymentDate(input.payment_date);
    const paymentMethod = this.requirePaymentMethod(input.payment_method);

    const card = await this.creditCardService.findByIdForUser(
      userId,
      input.credit_card_id,
    );
    if (!card.isActive) {
      throw new BadRequestException(
        'Inactive credit cards cannot receive payments.',
      );
    }
    if (amountCents > card.outstandingBalanceCents) {
      throw new BadRequestException(
        'Payment amount cannot exceed outstanding balance.',
      );
    }

    await this.assertWritablePaymentAccount(userId, input.payment_account_id);
    await this.assertSufficientAccountBalance(
      input.payment_account_id,
      amountCents,
    );
    await this.categoryService.assertAssignable(input.category_id, userId);

    const referenceNumber = input.reference_number?.trim() || null;
    const notes = input.notes?.trim() || null;

    const saved = await this.paymentsRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(CreditCardPayment);

        const ledger = await this.transactionService.create(
          userId,
          {
            account_id: input.payment_account_id,
            category_id: input.category_id,
            transaction_type: 'CREDIT_CARD_PAYMENT',
            amount_cents: amountCents,
            transaction_date: paymentDate,
            description: `Credit card payment (${paymentMethod})`,
            reference_number: referenceNumber ?? undefined,
            notes: notes ?? undefined,
            status: 'COMPLETED',
          },
          manager,
        );

        await this.creditCardService.applyPayment(
          userId,
          input.credit_card_id,
          amountCents,
          manager,
        );

        const entity = paymentRepo.create({
          userId,
          creditCardId: input.credit_card_id,
          paymentAccountId: input.payment_account_id,
          transactionId: ledger.id,
          amountCents,
          paymentDate,
          paymentMethod,
          referenceNumber,
          notes,
        });

        return paymentRepo.save(entity);
      },
    );

    return this.toModel(saved);
  }

  async update(
    userId: string,
    paymentId: string,
    input: UpdateCreditCardPaymentInput,
  ): Promise<CreditCardPaymentModel> {
    const existing = await this.requireOwnedPayment(userId, paymentId);

    const nextCardId = input.credit_card_id ?? existing.creditCardId;
    const nextAccountId = input.payment_account_id ?? existing.paymentAccountId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextDate =
      input.payment_date !== undefined
        ? this.requirePaymentDate(input.payment_date)
        : existing.paymentDate;
    const nextMethod =
      input.payment_method !== undefined
        ? this.requirePaymentMethod(input.payment_method)
        : existing.paymentMethod;

    if (input.credit_card_id !== undefined) {
      const card = await this.creditCardService.findByIdForUser(
        userId,
        nextCardId,
      );
      if (!card.isActive) {
        throw new BadRequestException(
          'Inactive credit cards cannot receive payments.',
        );
      }
    }
    if (input.payment_account_id !== undefined) {
      await this.assertWritablePaymentAccount(userId, nextAccountId);
    }
    if (input.category_id !== undefined) {
      await this.categoryService.assertAssignable(input.category_id, userId);
    }

    const accountCreditBack =
      nextAccountId === existing.paymentAccountId ? existing.amountCents : 0;
    await this.assertSufficientAccountBalance(
      nextAccountId,
      nextAmount,
      accountCreditBack,
    );

    const saved = await this.paymentsRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(CreditCardPayment);

        const row = await paymentRepo.findOne({ where: { id: paymentId } });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Credit card payment not found.');
        }

        await this.creditCardService.reversePayment(
          userId,
          row.creditCardId,
          row.amountCents,
          manager,
        );

        await this.creditCardService.applyPayment(
          userId,
          nextCardId,
          nextAmount,
          manager,
        );

        await this.transactionService.update(
          userId,
          row.transactionId,
          {
            account_id: input.payment_account_id,
            category_id: input.category_id,
            amount_cents: input.amount_cents,
            transaction_date: input.payment_date,
            description:
              input.payment_method !== undefined ||
              input.amount_cents !== undefined
                ? `Credit card payment (${nextMethod})`
                : undefined,
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        if (input.credit_card_id !== undefined) row.creditCardId = nextCardId;
        if (input.payment_account_id !== undefined) {
          row.paymentAccountId = nextAccountId;
        }
        if (input.amount_cents !== undefined) row.amountCents = nextAmount;
        if (input.payment_date !== undefined) row.paymentDate = nextDate;
        if (input.payment_method !== undefined) row.paymentMethod = nextMethod;
        if (input.reference_number !== undefined) {
          row.referenceNumber =
            input.reference_number === null
              ? null
              : input.reference_number.trim() || null;
        }
        if (input.notes !== undefined) {
          row.notes = input.notes === null ? null : input.notes.trim() || null;
        }

        return paymentRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  async delete(userId: string, paymentId: string): Promise<boolean> {
    await this.requireOwnedPayment(userId, paymentId);

    await this.paymentsRepo.manager.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(CreditCardPayment);

      const row = await paymentRepo.findOne({ where: { id: paymentId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Credit card payment not found.');
      }

      const { transactionId, creditCardId, amountCents } = row;
      await paymentRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
      await this.creditCardService.reversePayment(
        userId,
        creditCardId,
        amountCents,
        manager,
      );
    });

    return true;
  }

  private async queryPayments(
    userId: string,
    filter: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    const where: FindOptionsWhere<CreditCardPayment> = { userId };

    if (filter.credit_card_id) {
      where.creditCardId = filter.credit_card_id;
    }
    if (filter.payment_account_id) {
      where.paymentAccountId = filter.payment_account_id;
    }

    if (filter.start_date && filter.end_date) {
      where.paymentDate = Between(filter.start_date, filter.end_date);
    } else if (filter.start_date) {
      where.paymentDate = MoreThanOrEqual(filter.start_date);
    } else if (filter.end_date) {
      where.paymentDate = LessThanOrEqual(filter.end_date);
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.paymentsRepo.find({
      where,
      order: {
        paymentDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedPayment(
    userId: string,
    paymentId: string,
  ): Promise<CreditCardPayment> {
    const row = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!row) {
      throw new NotFoundException('Credit card payment not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this credit card payment.');
    }
    return row;
  }

  private async assertWritablePaymentAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(
      userId,
      accountId,
    );
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for credit card payments.',
      );
    }
  }

  private async assertSufficientAccountBalance(
    accountId: string,
    amountCents: number,
    creditBackCents = 0,
  ): Promise<void> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    const available = account.currentBalanceCents + creditBackCents;
    if (available < amountCents) {
      throw new BadRequestException('Insufficient account balance.');
    }
  }

  private requirePositiveAmount(amountCents: number): number {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    return amountCents;
  }

  private requirePaymentDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Payment date is required.');
    }
    return value;
  }

  private requirePaymentMethod(method: string): CreditCardPaymentMethod {
    if (
      !CREDIT_CARD_PAYMENT_METHODS.includes(
        method as (typeof CREDIT_CARD_PAYMENT_METHODS)[number],
      )
    ) {
      throw new BadRequestException('Invalid payment method.');
    }
    return method as CreditCardPaymentMethod;
  }

  private toModel(row: CreditCardPayment): CreditCardPaymentModel {
    return {
      id: row.id,
      userId: row.userId,
      creditCardId: row.creditCardId,
      paymentAccountId: row.paymentAccountId,
      transactionId: row.transactionId,
      amountCents: row.amountCents,
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as CreditCardPaymentModel;
  }
}
