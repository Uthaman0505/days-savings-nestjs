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
import { FamilyLoanService } from '../family-loan/family-loan.service';
import { TransactionService } from '../transaction/transaction.service';
import { CreateFamilyLoanPaymentInput } from './dto/create-family-loan-payment.input';
import { FamilyLoanPaymentFilterInput } from './dto/family-loan-payment-filter.input';
import { UpdateFamilyLoanPaymentInput } from './dto/update-family-loan-payment.input';
import {
  FamilyLoanPayment,
  FamilyLoanPaymentDirection,
} from './family-loan-payment.entity';
import { FamilyLoanPaymentModel } from './models/family-loan-payment.model';

type LoanSnapshot = {
  id: string;
  loanType: string;
  status: string;
  outstandingBalanceCents: number;
  personName: string;
};

@Injectable()
export class FamilyLoanPaymentService {
  constructor(
    @InjectRepository(FamilyLoanPayment)
    private readonly paymentsRepo: Repository<FamilyLoanPayment>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly familyLoanService: FamilyLoanService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyPayments(
    userId: string,
    filter?: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
    return this.queryPayments(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    paymentId: string,
  ): Promise<FamilyLoanPaymentModel> {
    const row = await this.requireOwnedPayment(userId, paymentId);
    return this.toModel(row);
  }

  async findByLoan(
    userId: string,
    familyLoanId: string,
    filter?: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
    await this.familyLoanService.findByIdForUser(userId, familyLoanId);
    return this.queryPayments(userId, {
      ...filter,
      family_loan_id: familyLoanId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
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
    input: CreateFamilyLoanPaymentInput,
  ): Promise<FamilyLoanPaymentModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const paymentDate = this.requirePaymentDate(input.payment_date);

    const loan = await this.requirePayableLoan(userId, input.family_loan_id);
    if (amountCents > loan.outstandingBalanceCents) {
      throw new BadRequestException(
        'Payment amount cannot exceed outstanding loan balance.',
      );
    }

    const paymentDirection = this.directionForLoanType(loan.loanType);
    const transactionType = this.ledgerTypeForDirection(paymentDirection);

    await this.assertWritablePaymentAccount(userId, input.payment_account_id);
    if (paymentDirection === 'PAY_TO_LENDER') {
      await this.assertSufficientAccountBalance(
        input.payment_account_id,
        amountCents,
      );
    }
    await this.categoryService.assertAssignable(input.category_id, userId);

    const referenceNumber = input.reference_number?.trim() || null;
    const notes = input.notes?.trim() || null;

    const saved = await this.paymentsRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(FamilyLoanPayment);

        const ledger = await this.transactionService.create(
          userId,
          {
            account_id: input.payment_account_id,
            category_id: input.category_id,
            transaction_type: transactionType,
            amount_cents: amountCents,
            transaction_date: paymentDate,
            description: this.ledgerDescription(
              paymentDirection,
              loan.personName,
            ),
            reference_number: referenceNumber ?? undefined,
            notes: notes ?? undefined,
            status: 'COMPLETED',
          },
          manager,
        );

        await this.familyLoanService.applyRepayment(
          userId,
          input.family_loan_id,
          amountCents,
          manager,
        );

        const entity = paymentRepo.create({
          userId,
          familyLoanId: input.family_loan_id,
          paymentAccountId: input.payment_account_id,
          transactionId: ledger.id,
          amountCents,
          paymentDate,
          paymentDirection,
          referenceNumber,
          notes,
          installmentNumber: null,
          attachmentKey: null,
        });

        return paymentRepo.save(entity);
      },
    );

    return this.toModel(saved);
  }

  async update(
    userId: string,
    paymentId: string,
    input: UpdateFamilyLoanPaymentInput,
  ): Promise<FamilyLoanPaymentModel> {
    const existing = await this.requireOwnedPayment(userId, paymentId);

    const nextLoanId = input.family_loan_id ?? existing.familyLoanId;
    const nextAccountId = input.payment_account_id ?? existing.paymentAccountId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextDate =
      input.payment_date !== undefined
        ? this.requirePaymentDate(input.payment_date)
        : existing.paymentDate;

    const nextLoan = await this.requirePayableLoan(userId, nextLoanId);
    const nextDirection = this.directionForLoanType(nextLoan.loanType);
    const nextLedgerType = this.ledgerTypeForDirection(nextDirection);

    // After reversing this payment, the target loan's available outstanding grows
    // by the existing amount when staying on the same loan.
    const restoredOutstanding =
      nextLoanId === existing.familyLoanId
        ? nextLoan.outstandingBalanceCents + existing.amountCents
        : nextLoan.outstandingBalanceCents;
    if (nextAmount > restoredOutstanding) {
      throw new BadRequestException(
        'Payment amount cannot exceed outstanding loan balance.',
      );
    }

    if (input.payment_account_id !== undefined) {
      await this.assertWritablePaymentAccount(userId, nextAccountId);
    }
    if (input.category_id !== undefined) {
      await this.categoryService.assertAssignable(input.category_id, userId);
    }

    if (nextDirection === 'PAY_TO_LENDER') {
      const accountCreditBack =
        nextAccountId === existing.paymentAccountId &&
        existing.paymentDirection === 'PAY_TO_LENDER'
          ? existing.amountCents
          : 0;
      await this.assertSufficientAccountBalance(
        nextAccountId,
        nextAmount,
        accountCreditBack,
      );
    }

    const saved = await this.paymentsRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(FamilyLoanPayment);

        const row = await paymentRepo.findOne({ where: { id: paymentId } });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Family loan payment not found.');
        }

        await this.familyLoanService.reverseRepayment(
          userId,
          row.familyLoanId,
          row.amountCents,
          manager,
        );

        await this.familyLoanService.applyRepayment(
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
            transaction_type: nextLedgerType,
            amount_cents: input.amount_cents,
            transaction_date: input.payment_date,
            description: this.ledgerDescription(
              nextDirection,
              nextLoan.personName,
            ),
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        if (input.family_loan_id !== undefined) row.familyLoanId = nextLoanId;
        if (input.payment_account_id !== undefined) {
          row.paymentAccountId = nextAccountId;
        }
        if (input.amount_cents !== undefined) row.amountCents = nextAmount;
        if (input.payment_date !== undefined) row.paymentDate = nextDate;
        row.paymentDirection = nextDirection;
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
      const paymentRepo = manager.getRepository(FamilyLoanPayment);

      const row = await paymentRepo.findOne({ where: { id: paymentId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Family loan payment not found.');
      }

      const { transactionId, familyLoanId, amountCents } = row;
      await paymentRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
      await this.familyLoanService.reverseRepayment(
        userId,
        familyLoanId,
        amountCents,
        manager,
      );
    });

    return true;
  }

  private async queryPayments(
    userId: string,
    filter: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
    const where: FindOptionsWhere<FamilyLoanPayment> = { userId };

    if (filter.family_loan_id) {
      where.familyLoanId = filter.family_loan_id;
    }
    if (filter.payment_account_id) {
      where.paymentAccountId = filter.payment_account_id;
    }
    if (filter.payment_direction) {
      where.paymentDirection = this.requireDirection(filter.payment_direction);
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
  ): Promise<FamilyLoanPayment> {
    const row = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!row) {
      throw new NotFoundException('Family loan payment not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this family loan payment.');
    }
    return row;
  }

  private async requirePayableLoan(
    userId: string,
    familyLoanId: string,
  ): Promise<LoanSnapshot> {
    const loan = await this.familyLoanService.findByIdForUser(
      userId,
      familyLoanId,
    );
    if (loan.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cancelled family loans cannot receive payments.',
      );
    }
    return loan;
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
        'Archived accounts cannot be used for family loan payments.',
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

  private directionForLoanType(loanType: string): FamilyLoanPaymentDirection {
    if (loanType === 'BORROWED') return 'PAY_TO_LENDER';
    if (loanType === 'LENT') return 'RECEIVE_FROM_BORROWER';
    throw new BadRequestException('Invalid family loan type.');
  }

  private ledgerTypeForDirection(
    direction: FamilyLoanPaymentDirection,
  ): 'FAMILY_LOAN_PAYMENT' | 'FAMILY_LOAN_COLLECTION' {
    return direction === 'PAY_TO_LENDER'
      ? 'FAMILY_LOAN_PAYMENT'
      : 'FAMILY_LOAN_COLLECTION';
  }

  private ledgerDescription(
    direction: FamilyLoanPaymentDirection,
    personName: string,
  ): string {
    return direction === 'PAY_TO_LENDER'
      ? `Family loan repayment to ${personName}`
      : `Family loan collection from ${personName}`;
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

  private requireDirection(direction: string): FamilyLoanPaymentDirection {
    if (
      direction !== 'PAY_TO_LENDER' &&
      direction !== 'RECEIVE_FROM_BORROWER'
    ) {
      throw new BadRequestException('Invalid payment direction.');
    }
    return direction;
  }

  private toModel(row: FamilyLoanPayment): FamilyLoanPaymentModel {
    return {
      id: row.id,
      userId: row.userId,
      familyLoanId: row.familyLoanId,
      paymentAccountId: row.paymentAccountId,
      transactionId: row.transactionId,
      amountCents: row.amountCents,
      paymentDate: row.paymentDate,
      paymentDirection: row.paymentDirection,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as FamilyLoanPaymentModel;
  }
}
