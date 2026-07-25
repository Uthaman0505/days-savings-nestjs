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
import { HouseLoanService } from '../house-loan/house-loan.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  CreateHouseLoanPaymentInput,
  HOUSE_LOAN_PAYMENT_TYPES,
} from './dto/create-house-loan-payment.input';
import { HouseLoanPaymentFilterInput } from './dto/house-loan-payment-filter.input';
import { UpdateHouseLoanPaymentInput } from './dto/update-house-loan-payment.input';
import {
  HouseLoanPayment,
  HouseLoanPaymentType,
} from './house-loan-payment.entity';
import { HouseLoanPaymentModel } from './models/house-loan-payment.model';

@Injectable()
export class HouseLoanPaymentService {
  constructor(
    @InjectRepository(HouseLoanPayment)
    private readonly paymentsRepo: Repository<HouseLoanPayment>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly houseLoanService: HouseLoanService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyPayments(
    userId: string,
    filter?: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
    return this.queryPayments(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    paymentId: string,
  ): Promise<HouseLoanPaymentModel> {
    const row = await this.requireOwnedPayment(userId, paymentId);
    return this.toModel(row);
  }

  async findByLoan(
    userId: string,
    houseLoanId: string,
    filter?: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
    await this.houseLoanService.findByIdForUser(userId, houseLoanId);
    return this.queryPayments(userId, {
      ...filter,
      house_loan_id: houseLoanId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
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
    input: CreateHouseLoanPaymentInput,
  ): Promise<HouseLoanPaymentModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const paymentDate = this.requirePaymentDate(input.payment_date);
    const paymentType = this.requirePaymentType(input.payment_type);

    const loan = await this.houseLoanService.findByIdForUser(
      userId,
      input.house_loan_id,
    );
    if (!loan.isActive) {
      throw new BadRequestException(
        'Inactive house loans cannot receive payments.',
      );
    }
    if (amountCents > loan.currentBalanceCents) {
      throw new BadRequestException(
        'Payment amount cannot exceed current loan balance.',
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
        const paymentRepo = manager.getRepository(HouseLoanPayment);

        const ledger = await this.transactionService.create(
          userId,
          {
            account_id: input.payment_account_id,
            category_id: input.category_id,
            transaction_type: 'LOAN_PAYMENT',
            amount_cents: amountCents,
            transaction_date: paymentDate,
            description: `House loan payment (${paymentType})`,
            reference_number: referenceNumber ?? undefined,
            notes: notes ?? undefined,
            status: 'COMPLETED',
          },
          manager,
        );

        await this.houseLoanService.applyPayment(
          userId,
          input.house_loan_id,
          amountCents,
          manager,
        );

        const entity = paymentRepo.create({
          userId,
          houseLoanId: input.house_loan_id,
          paymentAccountId: input.payment_account_id,
          transactionId: ledger.id,
          amountCents,
          paymentDate,
          paymentType,
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
    input: UpdateHouseLoanPaymentInput,
  ): Promise<HouseLoanPaymentModel> {
    const existing = await this.requireOwnedPayment(userId, paymentId);

    const nextLoanId = input.house_loan_id ?? existing.houseLoanId;
    const nextAccountId =
      input.payment_account_id ?? existing.paymentAccountId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextDate =
      input.payment_date !== undefined
        ? this.requirePaymentDate(input.payment_date)
        : existing.paymentDate;
    const nextType =
      input.payment_type !== undefined
        ? this.requirePaymentType(input.payment_type)
        : existing.paymentType;

    if (input.house_loan_id !== undefined) {
      const loan = await this.houseLoanService.findByIdForUser(
        userId,
        nextLoanId,
      );
      if (!loan.isActive) {
        throw new BadRequestException(
          'Inactive house loans cannot receive payments.',
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
        const paymentRepo = manager.getRepository(HouseLoanPayment);

        const row = await paymentRepo.findOne({ where: { id: paymentId } });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('House loan payment not found.');
        }

        await this.houseLoanService.reversePayment(
          userId,
          row.houseLoanId,
          row.amountCents,
          manager,
        );

        await this.houseLoanService.applyPayment(
          userId,
          nextLoanId,
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
              input.payment_type !== undefined ||
              input.amount_cents !== undefined
                ? `House loan payment (${nextType})`
                : undefined,
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        if (input.house_loan_id !== undefined) row.houseLoanId = nextLoanId;
        if (input.payment_account_id !== undefined) {
          row.paymentAccountId = nextAccountId;
        }
        if (input.amount_cents !== undefined) row.amountCents = nextAmount;
        if (input.payment_date !== undefined) row.paymentDate = nextDate;
        if (input.payment_type !== undefined) row.paymentType = nextType;
        if (input.reference_number !== undefined) {
          row.referenceNumber =
            input.reference_number === null
              ? null
              : input.reference_number.trim() || null;
        }
        if (input.notes !== undefined) {
          row.notes =
            input.notes === null ? null : input.notes.trim() || null;
        }

        return paymentRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  async delete(userId: string, paymentId: string): Promise<boolean> {
    await this.requireOwnedPayment(userId, paymentId);

    await this.paymentsRepo.manager.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(HouseLoanPayment);

      const row = await paymentRepo.findOne({ where: { id: paymentId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('House loan payment not found.');
      }

      const { transactionId, houseLoanId, amountCents } = row;
      await paymentRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
      await this.houseLoanService.reversePayment(
        userId,
        houseLoanId,
        amountCents,
        manager,
      );
    });

    return true;
  }

  private async queryPayments(
    userId: string,
    filter: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
    const where: FindOptionsWhere<HouseLoanPayment> = { userId };

    if (filter.house_loan_id) {
      where.houseLoanId = filter.house_loan_id;
    }
    if (filter.payment_account_id) {
      where.paymentAccountId = filter.payment_account_id;
    }
    if (filter.payment_type) {
      where.paymentType = this.requirePaymentType(filter.payment_type);
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
  ): Promise<HouseLoanPayment> {
    const row = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!row) {
      throw new NotFoundException('House loan payment not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this house loan payment.');
    }
    return row;
  }

  private async assertWritablePaymentAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(userId, accountId);
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for house loan payments.',
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

  private requirePaymentType(type: string): HouseLoanPaymentType {
    if (
      !HOUSE_LOAN_PAYMENT_TYPES.includes(
        type as (typeof HOUSE_LOAN_PAYMENT_TYPES)[number],
      )
    ) {
      throw new BadRequestException('Invalid payment type.');
    }
    return type as HouseLoanPaymentType;
  }

  private toModel(row: HouseLoanPayment): HouseLoanPaymentModel {
    return {
      id: row.id,
      userId: row.userId,
      houseLoanId: row.houseLoanId,
      paymentAccountId: row.paymentAccountId,
      transactionId: row.transactionId,
      amountCents: row.amountCents,
      paymentDate: row.paymentDate,
      paymentType: row.paymentType,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as HouseLoanPaymentModel;
  }
}
