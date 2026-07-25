import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { CreateHouseLoanInput } from './dto/create-house-loan.input';
import { UpdateHouseLoanInput } from './dto/update-house-loan.input';
import { HouseLoan } from './house-loan.entity';
import { HouseLoanModel } from './models/house-loan.model';

@Injectable()
export class HouseLoanService {
  constructor(
    @InjectRepository(HouseLoan)
    private readonly houseLoansRepo: Repository<HouseLoan>,
  ) {}

  async findMyHouseLoans(userId: string): Promise<HouseLoanModel[]> {
    const rows = await this.houseLoansRepo.find({
      where: { userId },
      order: { loanName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findActiveHouseLoans(userId: string): Promise<HouseLoanModel[]> {
    const rows = await this.houseLoansRepo.find({
      where: { userId, isActive: true },
      order: { loanName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    houseLoanId: string,
  ): Promise<HouseLoanModel> {
    const row = await this.requireOwnedLoan(userId, houseLoanId);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateHouseLoanInput,
  ): Promise<HouseLoanModel> {
    const loanName = this.normalizeName(input.loan_name, 'Loan name');
    const bankName = this.normalizeName(input.bank_name, 'Bank name');
    const loanAccountNumber = this.normalizeName(
      input.loan_account_number,
      'Loan account number',
    );
    const principalAmountCents = this.requirePositiveCents(
      input.principal_amount_cents,
      'Principal amount',
    );
    const currentBalanceCents = this.requireNonNegativeCents(
      input.current_balance_cents ?? principalAmountCents,
      'Current balance',
    );
    const interestRate = this.requireInterestRate(input.interest_rate);
    const loanTermMonths = this.requirePositiveInt(
      input.loan_term_months,
      'Loan term',
    );
    const monthlyInstallmentCents = this.requirePositiveCents(
      input.monthly_installment_cents,
      'Monthly installment',
    );
    const paymentDueDay = this.requireDay(
      input.payment_due_day,
      'Payment due day',
    );
    const startDate = this.requireDateString(input.start_date, 'Start date');
    const maturityDate = this.requireDateString(
      input.maturity_date,
      'Maturity date',
    );

    this.assertBalanceWithinPrincipal(
      principalAmountCents,
      currentBalanceCents,
    );
    this.assertMaturityAfterStart(startDate, maturityDate);
    await this.assertUniqueLoanAccountNumber(userId, loanAccountNumber);

    const entity = this.houseLoansRepo.create({
      userId,
      loanName,
      bankName,
      loanAccountNumber,
      principalAmountCents,
      currentBalanceCents,
      interestRate: interestRate.toFixed(4),
      loanTermMonths,
      monthlyInstallmentCents,
      startDate,
      maturityDate,
      paymentDueDay,
      currency: (input.currency ?? 'MYR').toUpperCase(),
      isActive: true,
    });

    const saved = await this.houseLoansRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    houseLoanId: string,
    input: UpdateHouseLoanInput,
  ): Promise<HouseLoanModel> {
    const loan = await this.requireOwnedLoan(userId, houseLoanId);

    const nextPrincipal =
      input.principal_amount_cents !== undefined
        ? this.requirePositiveCents(
            input.principal_amount_cents,
            'Principal amount',
          )
        : loan.principalAmountCents;
    const nextBalance =
      input.current_balance_cents !== undefined
        ? this.requireNonNegativeCents(
            input.current_balance_cents,
            'Current balance',
          )
        : loan.currentBalanceCents;
    const nextStart =
      input.start_date !== undefined
        ? this.requireDateString(input.start_date, 'Start date')
        : loan.startDate;
    const nextMaturity =
      input.maturity_date !== undefined
        ? this.requireDateString(input.maturity_date, 'Maturity date')
        : loan.maturityDate;

    this.assertBalanceWithinPrincipal(nextPrincipal, nextBalance);
    this.assertMaturityAfterStart(nextStart, nextMaturity);

    if (input.loan_name !== undefined) {
      loan.loanName = this.normalizeName(input.loan_name, 'Loan name');
    }
    if (input.bank_name !== undefined) {
      loan.bankName = this.normalizeName(input.bank_name, 'Bank name');
    }
    if (input.loan_account_number !== undefined) {
      const loanAccountNumber = this.normalizeName(
        input.loan_account_number,
        'Loan account number',
      );
      await this.assertUniqueLoanAccountNumber(
        userId,
        loanAccountNumber,
        houseLoanId,
      );
      loan.loanAccountNumber = loanAccountNumber;
    }
    if (input.principal_amount_cents !== undefined) {
      loan.principalAmountCents = nextPrincipal;
    }
    if (input.current_balance_cents !== undefined) {
      loan.currentBalanceCents = nextBalance;
    }
    if (input.interest_rate !== undefined) {
      loan.interestRate = this.requireInterestRate(input.interest_rate).toFixed(
        4,
      );
    }
    if (input.loan_term_months !== undefined) {
      loan.loanTermMonths = this.requirePositiveInt(
        input.loan_term_months,
        'Loan term',
      );
    }
    if (input.monthly_installment_cents !== undefined) {
      loan.monthlyInstallmentCents = this.requirePositiveCents(
        input.monthly_installment_cents,
        'Monthly installment',
      );
    }
    if (input.start_date !== undefined) loan.startDate = nextStart;
    if (input.maturity_date !== undefined) loan.maturityDate = nextMaturity;
    if (input.payment_due_day !== undefined) {
      loan.paymentDueDay = this.requireDay(
        input.payment_due_day,
        'Payment due day',
      );
    }
    if (input.currency !== undefined) {
      loan.currency = input.currency.toUpperCase();
    }

    const saved = await this.houseLoansRepo.save(loan);
    return this.toModel(saved);
  }

  async archive(
    userId: string,
    houseLoanId: string,
  ): Promise<HouseLoanModel> {
    const loan = await this.requireOwnedLoan(userId, houseLoanId);
    loan.isActive = false;
    const saved = await this.houseLoansRepo.save(loan);
    return this.toModel(saved);
  }

  async delete(userId: string, houseLoanId: string): Promise<boolean> {
    const loan = await this.requireOwnedLoan(userId, houseLoanId);
    await this.houseLoansRepo.remove(loan);
    return true;
  }

  /**
   * Apply a payment against the loan current balance.
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async applyPayment(
    userId: string,
    houseLoanId: string,
    paymentAmountCents: number,
    manager?: EntityManager,
  ): Promise<HouseLoanModel> {
    if (!Number.isInteger(paymentAmountCents) || paymentAmountCents <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const run = async (mgr: EntityManager): Promise<HouseLoan> => {
      const loanRepo = mgr.getRepository(HouseLoan);
      const loan = await loanRepo.findOne({ where: { id: houseLoanId } });
      if (!loan) {
        throw new NotFoundException('House loan not found.');
      }
      if (loan.userId !== userId) {
        throw new ForbiddenException('You do not own this house loan.');
      }
      if (paymentAmountCents > loan.currentBalanceCents) {
        throw new BadRequestException(
          'Payment amount cannot exceed current loan balance.',
        );
      }

      loan.currentBalanceCents -= paymentAmountCents;
      return loanRepo.save(loan);
    };

    const saved = manager
      ? await run(manager)
      : await this.houseLoansRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  /**
   * Reverse a previously applied payment (restore loan balance).
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async reversePayment(
    userId: string,
    houseLoanId: string,
    paymentAmountCents: number,
    manager?: EntityManager,
  ): Promise<HouseLoanModel> {
    if (!Number.isInteger(paymentAmountCents) || paymentAmountCents <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const run = async (mgr: EntityManager): Promise<HouseLoan> => {
      const loanRepo = mgr.getRepository(HouseLoan);
      const loan = await loanRepo.findOne({ where: { id: houseLoanId } });
      if (!loan) {
        throw new NotFoundException('House loan not found.');
      }
      if (loan.userId !== userId) {
        throw new ForbiddenException('You do not own this house loan.');
      }

      const nextBalance = loan.currentBalanceCents + paymentAmountCents;
      if (nextBalance > loan.principalAmountCents) {
        throw new BadRequestException(
          'Restoring this payment would exceed the principal amount.',
        );
      }

      loan.currentBalanceCents = nextBalance;
      return loanRepo.save(loan);
    };

    const saved = manager
      ? await run(manager)
      : await this.houseLoansRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  private async requireOwnedLoan(
    userId: string,
    houseLoanId: string,
  ): Promise<HouseLoan> {
    const loan = await this.houseLoansRepo.findOne({
      where: { id: houseLoanId },
    });
    if (!loan) {
      throw new NotFoundException('House loan not found.');
    }
    if (loan.userId !== userId) {
      throw new ForbiddenException('You do not own this house loan.');
    }
    return loan;
  }

  private async assertUniqueLoanAccountNumber(
    userId: string,
    loanAccountNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.houseLoansRepo.findOne({
      where: excludeId
        ? { userId, loanAccountNumber, id: Not(excludeId) }
        : { userId, loanAccountNumber },
    });
    if (existing) {
      throw new BadRequestException(
        'A house loan with this account number already exists.',
      );
    }
  }

  private assertBalanceWithinPrincipal(
    principalAmountCents: number,
    currentBalanceCents: number,
  ): void {
    if (currentBalanceCents > principalAmountCents) {
      throw new BadRequestException(
        'Current balance cannot exceed principal amount.',
      );
    }
  }

  private assertMaturityAfterStart(startDate: string, maturityDate: string): void {
    if (maturityDate < startDate) {
      throw new BadRequestException(
        'Maturity date must be on or after start date.',
      );
    }
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

  private requirePositiveInt(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private requireInterestRate(value: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      throw new BadRequestException('Interest rate cannot be negative.');
    }
    return value;
  }

  private requireDay(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      throw new BadRequestException(`${label} must be between 1 and 31.`);
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

  private toModel(row: HouseLoan): HouseLoanModel {
    return {
      id: row.id,
      userId: row.userId,
      loanName: row.loanName,
      bankName: row.bankName,
      loanAccountNumber: row.loanAccountNumber,
      principalAmountCents: row.principalAmountCents,
      currentBalanceCents: row.currentBalanceCents,
      interestRate: Number(row.interestRate),
      loanTermMonths: row.loanTermMonths,
      monthlyInstallmentCents: row.monthlyInstallmentCents,
      startDate:
        typeof row.startDate === 'string'
          ? row.startDate.slice(0, 10)
          : new Date(row.startDate).toISOString().slice(0, 10),
      maturityDate:
        typeof row.maturityDate === 'string'
          ? row.maturityDate.slice(0, 10)
          : new Date(row.maturityDate).toISOString().slice(0, 10),
      paymentDueDay: row.paymentDueDay,
      currency: row.currency,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as HouseLoanModel;
  }
}
