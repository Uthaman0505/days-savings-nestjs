import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HouseLoan } from './house-loan.entity';
import { HouseLoanService } from './house-loan.service';

describe('HouseLoanService', () => {
  let service: HouseLoanService;
  let repo: jest.Mocked<
    Pick<
      Repository<HouseLoan>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  >;

  const baseLoan = (overrides: Partial<HouseLoan> = {}): HouseLoan =>
    ({
      id: 'hl-1',
      userId: 'user-1',
      loanName: 'Maybank Home Loan',
      bankName: 'Maybank',
      loanAccountNumber: 'HL-001',
      principalAmountCents: 50000000,
      currentBalanceCents: 45000000,
      interestRate: '3.7500',
      loanTermMonths: 360,
      monthlyInstallmentCents: 250000,
      startDate: '2020-01-01',
      maturityDate: '2050-01-01',
      paymentDueDay: 5,
      currency: 'MYR',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as HouseLoan;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as HouseLoan),
      save: jest.fn(async (x) => {
        const entity = x as HouseLoan;
        return {
          ...entity,
          id: entity.id ?? 'hl-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as HouseLoan;
      }),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseLoanService,
        { provide: getRepositoryToken(HouseLoan), useValue: repo },
      ],
    }).compile();

    service = module.get(HouseLoanService);
  });

  it('creates a house loan and defaults current balance to principal', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      loan_name: '  Maybank Home Loan  ',
      bank_name: 'Maybank',
      loan_account_number: 'HL-001',
      principal_amount_cents: 50000000,
      interest_rate: 3.75,
      loan_term_months: 360,
      monthly_installment_cents: 250000,
      start_date: '2020-01-01',
      maturity_date: '2050-01-01',
      payment_due_day: 5,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        loanName: 'Maybank Home Loan',
        principalAmountCents: 50000000,
        currentBalanceCents: 50000000,
        interestRate: '3.7500',
        isActive: true,
      }),
    );
    expect(result.interestRate).toBe(3.75);
  });

  it('rejects duplicate loan account numbers for the same user', async () => {
    repo.findOne.mockResolvedValue(baseLoan());

    await expect(
      service.create('user-1', {
        loan_name: 'Other Loan',
        bank_name: 'CIMB',
        loan_account_number: 'HL-001',
        principal_amount_cents: 10000000,
        interest_rate: 4,
        loan_term_months: 240,
        monthly_installment_cents: 100000,
        start_date: '2021-01-01',
        maturity_date: '2041-01-01',
        payment_due_day: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects current balance above principal', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        loan_name: 'CIMB Housing Loan',
        bank_name: 'CIMB',
        loan_account_number: 'HL-002',
        principal_amount_cents: 10000000,
        current_balance_cents: 12000000,
        interest_rate: 4,
        loan_term_months: 240,
        monthly_installment_cents: 100000,
        start_date: '2021-01-01',
        maturity_date: '2041-01-01',
        payment_due_day: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative interest rate', async () => {
    await expect(
      service.create('user-1', {
        loan_name: 'Public Bank Mortgage',
        bank_name: 'Public Bank',
        loan_account_number: 'HL-003',
        principal_amount_cents: 10000000,
        interest_rate: -1,
        loan_term_months: 240,
        monthly_installment_cents: 100000,
        start_date: '2021-01-01',
        maturity_date: '2041-01-01',
        payment_due_day: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid payment due day', async () => {
    await expect(
      service.create('user-1', {
        loan_name: 'Public Bank Mortgage',
        bank_name: 'Public Bank',
        loan_account_number: 'HL-003',
        principal_amount_cents: 10000000,
        interest_rate: 3.5,
        loan_term_months: 240,
        monthly_installment_cents: 100000,
        start_date: '2021-01-01',
        maturity_date: '2041-01-01',
        payment_due_day: 32,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user loan', async () => {
    repo.findOne.mockResolvedValue(baseLoan({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'hl-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when loan is missing', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists active loans only', async () => {
    repo.find.mockResolvedValue([baseLoan()]);

    const rows = await service.findActiveHouseLoans('user-1');

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', isActive: true },
      order: { loanName: 'ASC', createdAt: 'ASC' },
    });
    expect(rows).toHaveLength(1);
  });

  it('archives a loan by setting is_active false', async () => {
    repo.findOne.mockResolvedValue(baseLoan({ isActive: true }));

    const result = await service.archive('user-1', 'hl-1');

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(result.isActive).toBe(false);
  });

  it('deletes an owned loan', async () => {
    const row = baseLoan();
    repo.findOne.mockResolvedValue(row);
    repo.remove.mockResolvedValue(row);

    await expect(service.delete('user-1', 'hl-1')).resolves.toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});
