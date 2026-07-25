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
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  CreateFamilyLoanInput,
  FAMILY_LOAN_STATUSES,
  FAMILY_LOAN_TYPES,
} from './dto/create-family-loan.input';
import { FamilyLoanFilterInput } from './dto/family-loan-filter.input';
import { UpdateFamilyLoanInput } from './dto/update-family-loan.input';
import {
  FamilyLoan,
  FamilyLoanStatus,
  FamilyLoanType,
} from './family-loan.entity';
import { FamilyLoanModel } from './models/family-loan.model';

@Injectable()
export class FamilyLoanService {
  constructor(
    @InjectRepository(FamilyLoan)
    private readonly familyLoansRepo: Repository<FamilyLoan>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyFamilyLoans(
    userId: string,
    filter?: FamilyLoanFilterInput,
  ): Promise<FamilyLoanModel[]> {
    return this.queryLoans(userId, filter ?? {});
  }

  async findActiveFamilyLoans(userId: string): Promise<FamilyLoanModel[]> {
    const rows = await this.familyLoansRepo.find({
      where: { userId, isActive: true },
      order: { loanStartDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByType(
    userId: string,
    type: string,
  ): Promise<FamilyLoanModel[]> {
    const loanType = this.requireLoanType(type);
    const rows = await this.familyLoansRepo.find({
      where: { userId, loanType },
      order: { loanStartDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    familyLoanId: string,
  ): Promise<FamilyLoanModel> {
    const row = await this.requireOwnedLoan(userId, familyLoanId);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateFamilyLoanInput,
  ): Promise<FamilyLoanModel> {
    const loanType = this.requireLoanType(input.loan_type);
    const personName = this.normalizeName(input.person_name, 'Person name');
    const relationship = this.normalizeName(
      input.relationship,
      'Relationship',
    );
    const principalAmountCents = this.requirePositiveCents(
      input.principal_amount_cents,
      'Principal amount',
    );
    const outstandingBalanceCents = this.requireNonNegativeCents(
      input.outstanding_balance_cents ?? principalAmountCents,
      'Outstanding balance',
    );
    this.assertOutstandingWithinPrincipal(
      principalAmountCents,
      outstandingBalanceCents,
    );
    const interestRate = this.requireInterestRate(input.interest_rate ?? 0);
    const loanStartDate = this.requireDateString(
      input.loan_start_date,
      'Loan start date',
    );
    const expectedEndDate =
      input.expected_end_date !== undefined
        ? this.requireDateString(input.expected_end_date, 'Expected end date')
        : null;
    if (expectedEndDate) {
      this.assertDateOnOrAfter(
        expectedEndDate,
        loanStartDate,
        'Expected end date must not be before loan start date.',
      );
    }

    await this.assertWritableAccount(userId, input.account_id);
    if (loanType === 'LENT') {
      await this.assertSufficientAccountBalance(
        input.account_id,
        principalAmountCents,
      );
    }
    await this.categoryService.assertAssignable(input.category_id, userId);

    const transactionType =
      loanType === 'BORROWED' ? 'LOAN_RECEIVED' : 'LOAN_GIVEN';
    const status: FamilyLoanStatus =
      outstandingBalanceCents === 0 ? 'COMPLETED' : 'ACTIVE';

    const saved = await this.familyLoansRepo.manager.transaction(
      async (manager) => {
        const loanRepo = manager.getRepository(FamilyLoan);

        const ledger = await this.transactionService.create(
          userId,
          {
            account_id: input.account_id,
            category_id: input.category_id,
            transaction_type: transactionType,
            amount_cents: principalAmountCents,
            transaction_date: new Date(`${loanStartDate}T00:00:00.000Z`),
            description: `${loanType} family loan with ${personName}`,
            notes: input.notes,
            status: 'COMPLETED',
          },
          manager,
        );

        const entity = loanRepo.create({
          userId,
          loanType,
          personName,
          relationship,
          contactNumber: input.contact_number?.trim() || null,
          accountId: input.account_id,
          transactionId: ledger.id,
          principalAmountCents,
          outstandingBalanceCents,
          interestRate: interestRate.toFixed(4),
          loanStartDate,
          expectedEndDate,
          currency: (input.currency ?? 'MYR').toUpperCase(),
          notes: input.notes?.trim() || null,
          agreementDocumentKey: null,
          guarantorName: null,
          status,
          isActive: true,
        });

        return loanRepo.save(entity);
      },
    );

    return this.toModel(saved);
  }

  async update(
    userId: string,
    familyLoanId: string,
    input: UpdateFamilyLoanInput,
  ): Promise<FamilyLoanModel> {
    const loan = await this.requireOwnedLoan(userId, familyLoanId);

    const nextPrincipal =
      input.principal_amount_cents !== undefined
        ? this.requirePositiveCents(
            input.principal_amount_cents,
            'Principal amount',
          )
        : loan.principalAmountCents;
    const nextOutstanding =
      input.outstanding_balance_cents !== undefined
        ? this.requireNonNegativeCents(
            input.outstanding_balance_cents,
            'Outstanding balance',
          )
        : loan.outstandingBalanceCents;
    this.assertOutstandingWithinPrincipal(nextPrincipal, nextOutstanding);

    const nextStart =
      input.loan_start_date !== undefined
        ? this.requireDateString(input.loan_start_date, 'Loan start date')
        : loan.loanStartDate;
    const nextEnd =
      input.expected_end_date !== undefined
        ? input.expected_end_date === null
          ? null
          : this.requireDateString(
              input.expected_end_date,
              'Expected end date',
            )
        : loan.expectedEndDate;
    if (nextEnd) {
      this.assertDateOnOrAfter(
        nextEnd,
        nextStart,
        'Expected end date must not be before loan start date.',
      );
    }

    if (input.person_name !== undefined) {
      loan.personName = this.normalizeName(input.person_name, 'Person name');
    }
    if (input.relationship !== undefined) {
      loan.relationship = this.normalizeName(
        input.relationship,
        'Relationship',
      );
    }
    if (input.contact_number !== undefined) {
      loan.contactNumber =
        input.contact_number === null
          ? null
          : input.contact_number.trim() || null;
    }
    if (input.principal_amount_cents !== undefined) {
      loan.principalAmountCents = nextPrincipal;
    }
    if (input.outstanding_balance_cents !== undefined) {
      loan.outstandingBalanceCents = nextOutstanding;
    }
    if (input.interest_rate !== undefined) {
      loan.interestRate = this.requireInterestRate(input.interest_rate).toFixed(
        4,
      );
    }
    if (input.loan_start_date !== undefined) loan.loanStartDate = nextStart;
    if (input.expected_end_date !== undefined) loan.expectedEndDate = nextEnd;
    if (input.currency !== undefined) {
      loan.currency = input.currency.toUpperCase();
    }
    if (input.notes !== undefined) {
      loan.notes = input.notes === null ? null : input.notes.trim() || null;
    }
    if (input.status !== undefined) {
      loan.status = this.requireStatus(input.status);
    } else if (loan.outstandingBalanceCents === 0 && loan.status === 'ACTIVE') {
      loan.status = 'COMPLETED';
    }

    const saved = await this.familyLoansRepo.save(loan);
    return this.toModel(saved);
  }

  async archive(
    userId: string,
    familyLoanId: string,
  ): Promise<FamilyLoanModel> {
    const loan = await this.requireOwnedLoan(userId, familyLoanId);
    loan.isActive = false;
    const saved = await this.familyLoansRepo.save(loan);
    return this.toModel(saved);
  }

  async delete(userId: string, familyLoanId: string): Promise<boolean> {
    await this.requireOwnedLoan(userId, familyLoanId);

    await this.familyLoansRepo.manager.transaction(async (manager) => {
      const loanRepo = manager.getRepository(FamilyLoan);
      const row = await loanRepo.findOne({ where: { id: familyLoanId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Family loan not found.');
      }

      const transactionId = row.transactionId;
      await loanRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
    });

    return true;
  }

  /**
   * Apply a repayment against outstanding balance (used by Family Loan Payment).
   */
  async applyRepayment(
    userId: string,
    familyLoanId: string,
    amountCents: number,
    manager?: EntityManager,
  ): Promise<FamilyLoanModel> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Repayment amount must be greater than zero.');
    }

    const run = async (mgr: EntityManager) => {
      const loanRepo = mgr.getRepository(FamilyLoan);
      const loan = await loanRepo.findOne({ where: { id: familyLoanId } });
      if (!loan) {
        throw new NotFoundException('Family loan not found.');
      }
      if (loan.userId !== userId) {
        throw new ForbiddenException('You do not own this family loan.');
      }
      if (amountCents > loan.outstandingBalanceCents) {
        throw new BadRequestException(
          'Repayment amount cannot exceed outstanding balance.',
        );
      }

      loan.outstandingBalanceCents -= amountCents;
      if (loan.outstandingBalanceCents === 0) {
        loan.status = 'COMPLETED';
        loan.isActive = false;
      }
      return loanRepo.save(loan);
    };

    const saved = manager
      ? await run(manager)
      : await this.familyLoansRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  /**
   * Reverse a repayment (used by Family Loan Payment delete/update).
   */
  async reverseRepayment(
    userId: string,
    familyLoanId: string,
    amountCents: number,
    manager?: EntityManager,
  ): Promise<FamilyLoanModel> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Repayment amount must be greater than zero.');
    }

    const run = async (mgr: EntityManager) => {
      const loanRepo = mgr.getRepository(FamilyLoan);
      const loan = await loanRepo.findOne({ where: { id: familyLoanId } });
      if (!loan) {
        throw new NotFoundException('Family loan not found.');
      }
      if (loan.userId !== userId) {
        throw new ForbiddenException('You do not own this family loan.');
      }

      const nextOutstanding = loan.outstandingBalanceCents + amountCents;
      if (nextOutstanding > loan.principalAmountCents) {
        throw new BadRequestException(
          'Restoring this repayment would exceed the principal amount.',
        );
      }

      loan.outstandingBalanceCents = nextOutstanding;
      if (loan.status === 'COMPLETED' && nextOutstanding > 0) {
        loan.status = 'ACTIVE';
        loan.isActive = true;
      }
      return loanRepo.save(loan);
    };

    const saved = manager
      ? await run(manager)
      : await this.familyLoansRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  private async queryLoans(
    userId: string,
    filter: FamilyLoanFilterInput,
  ): Promise<FamilyLoanModel[]> {
    const where: FindOptionsWhere<FamilyLoan> = { userId };

    if (filter.loan_type) {
      where.loanType = this.requireLoanType(filter.loan_type);
    }
    if (filter.status) {
      where.status = this.requireStatus(filter.status);
    }
    if (filter.relationship?.trim()) {
      where.relationship = filter.relationship.trim();
    }

    if (filter.start_date && filter.end_date) {
      where.loanStartDate = Between(
        this.requireDateString(filter.start_date, 'Start date'),
        this.requireDateString(filter.end_date, 'End date'),
      );
    } else if (filter.start_date) {
      where.loanStartDate = MoreThanOrEqual(
        this.requireDateString(filter.start_date, 'Start date'),
      );
    } else if (filter.end_date) {
      where.loanStartDate = LessThanOrEqual(
        this.requireDateString(filter.end_date, 'End date'),
      );
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.familyLoansRepo.find({
      where,
      order: {
        loanStartDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedLoan(
    userId: string,
    familyLoanId: string,
  ): Promise<FamilyLoan> {
    const loan = await this.familyLoansRepo.findOne({
      where: { id: familyLoanId },
    });
    if (!loan) {
      throw new NotFoundException('Family loan not found.');
    }
    if (loan.userId !== userId) {
      throw new ForbiddenException('You do not own this family loan.');
    }
    return loan;
  }

  private async assertWritableAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(userId, accountId);
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for family loans.',
      );
    }
  }

  private async assertSufficientAccountBalance(
    accountId: string,
    amountCents: number,
  ): Promise<void> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    if (account.currentBalanceCents < amountCents) {
      throw new BadRequestException('Insufficient account balance.');
    }
  }

  private assertOutstandingWithinPrincipal(
    principalAmountCents: number,
    outstandingBalanceCents: number,
  ): void {
    if (outstandingBalanceCents > principalAmountCents) {
      throw new BadRequestException(
        'Outstanding balance cannot exceed principal amount.',
      );
    }
  }

  private assertDateOnOrAfter(
    later: string,
    earlier: string,
    message: string,
  ): void {
    if (later < earlier) {
      throw new BadRequestException(message);
    }
  }

  private requireLoanType(type: string): FamilyLoanType {
    if (!FAMILY_LOAN_TYPES.includes(type as (typeof FAMILY_LOAN_TYPES)[number])) {
      throw new BadRequestException('Invalid family loan type.');
    }
    return type as FamilyLoanType;
  }

  private requireStatus(status: string): FamilyLoanStatus {
    if (
      !FAMILY_LOAN_STATUSES.includes(
        status as (typeof FAMILY_LOAN_STATUSES)[number],
      )
    ) {
      throw new BadRequestException('Invalid family loan status.');
    }
    return status as FamilyLoanStatus;
  }

  private requirePositiveCents(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private requireNonNegativeCents(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${label} cannot be negative.`);
    }
    return value;
  }

  private requireInterestRate(value: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      throw new BadRequestException('Interest rate cannot be negative.');
    }
    return value;
  }

  private requireDateString(value: string, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed.slice(0, 10);
  }

  private normalizeName(name: string, label: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed;
  }

  private toDateField(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  private toModel(row: FamilyLoan): FamilyLoanModel {
    return {
      id: row.id,
      userId: row.userId,
      loanType: row.loanType,
      personName: row.personName,
      relationship: row.relationship,
      contactNumber: row.contactNumber,
      accountId: row.accountId,
      transactionId: row.transactionId,
      principalAmountCents: row.principalAmountCents,
      outstandingBalanceCents: row.outstandingBalanceCents,
      interestRate: Number(row.interestRate),
      loanStartDate: this.toDateField(row.loanStartDate),
      expectedEndDate: row.expectedEndDate
        ? this.toDateField(row.expectedEndDate)
        : null,
      currency: row.currency,
      notes: row.notes,
      status: row.status,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as FamilyLoanModel;
  }
}
