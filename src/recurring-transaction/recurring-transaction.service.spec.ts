import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { CreditCardPaymentService } from '../credit-card-payment/credit-card-payment.service';
import { ExpenseService } from '../expense/expense.service';
import { FamilyLoanPaymentService } from '../family-loan-payment/family-loan-payment.service';
import { GoalsService } from '../goals/goals.service';
import { HouseLoanPaymentService } from '../house-loan-payment/house-loan-payment.service';
import { IncomeService } from '../income/income.service';
import { InsurancePaymentService } from '../insurance-payment/insurance-payment.service';
import { SavingsService } from '../savings/savings.service';
import { TransferService } from '../transfer/transfer.service';
import { RecurringTransaction } from './recurring-transaction.entity';
import { RecurringTransactionService } from './recurring-transaction.service';

describe('RecurringTransactionService', () => {
  let service: RecurringTransactionService;
  let recurringRepo: jest.Mocked<
    Pick<
      Repository<RecurringTransaction>,
      'find' | 'findOne' | 'create' | 'save' | 'remove' | 'createQueryBuilder'
    >
  > & {
    manager: { transaction: jest.Mock };
  };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };
  let incomeService: { create: jest.Mock };
  let expenseService: { create: jest.Mock };
  let transferService: { create: jest.Mock };
  let savingsService: { deposit: jest.Mock };
  let goalsService: { contribute: jest.Mock };
  let creditCardPaymentService: { create: jest.Mock };
  let houseLoanPaymentService: { create: jest.Mock };
  let insurancePaymentService: { create: jest.Mock };
  let familyLoanPaymentService: { create: jest.Mock };

  const baseRow = (
    overrides: Partial<RecurringTransaction> = {},
  ): RecurringTransaction =>
    ({
      id: 'rt-1',
      userId: 'user-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      targetModule: 'INCOME',
      targetReferenceId: null,
      name: 'Monthly Salary',
      description: null,
      transactionType: 'INCOME',
      amountCents: 500000,
      currency: 'MYR',
      frequency: 'MONTHLY',
      intervalValue: 1,
      startDate: '2026-01-01',
      endDate: null,
      nextExecutionDate: new Date('2026-03-01T00:00:00.000Z'),
      lastExecutionDate: null,
      timezone: 'UTC',
      isActive: true,
      autoExecute: true,
      retryCount: 0,
      maxRetryCount: 3,
      executionPayload: { income_source: 'SALARY' },
      lastError: null,
      reminderEnabled: false,
      alertOnFailure: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as RecurringTransaction;

  beforeEach(async () => {
    const managerRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: RecurringTransaction) => x),
    };

    recurringRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as RecurringTransaction),
      save: jest.fn(async (x) => {
        const entity = x as RecurringTransaction;
        return {
          ...entity,
          id: entity.id ?? 'rt-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as RecurringTransaction;
      }),
      remove: jest.fn(async (x) => x as RecurringTransaction),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({ getRepository: () => managerRepo }),
        ),
      },
    };

    (
      recurringRepo as unknown as { _managerRepo: typeof managerRepo }
    )._managerRepo = managerRepo;

    accountService = {
      findByIdForUser: jest.fn(async () => ({ id: 'acc-1', isArchived: false })),
    };
    categoryService = {
      assertAssignable: jest.fn(async () => ({ id: 'cat-1' })),
    };
    incomeService = { create: jest.fn(async () => ({ id: 'inc-1' })) };
    expenseService = { create: jest.fn(async () => ({ id: 'exp-1' })) };
    transferService = { create: jest.fn(async () => ({ id: 'tr-1' })) };
    savingsService = { deposit: jest.fn(async () => ({ id: 'sav-1' })) };
    goalsService = { contribute: jest.fn(async () => ({ id: 'gc-1' })) };
    creditCardPaymentService = {
      create: jest.fn(async () => ({ id: 'ccp-1' })),
    };
    houseLoanPaymentService = {
      create: jest.fn(async () => ({ id: 'hlp-1' })),
    };
    insurancePaymentService = {
      create: jest.fn(async () => ({ id: 'ip-1' })),
    };
    familyLoanPaymentService = {
      create: jest.fn(async () => ({ id: 'flp-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringTransactionService,
        {
          provide: getRepositoryToken(RecurringTransaction),
          useValue: recurringRepo,
        },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
        { provide: IncomeService, useValue: incomeService },
        { provide: ExpenseService, useValue: expenseService },
        { provide: TransferService, useValue: transferService },
        { provide: SavingsService, useValue: savingsService },
        { provide: GoalsService, useValue: goalsService },
        {
          provide: CreditCardPaymentService,
          useValue: creditCardPaymentService,
        },
        {
          provide: HouseLoanPaymentService,
          useValue: houseLoanPaymentService,
        },
        {
          provide: InsurancePaymentService,
          useValue: insurancePaymentService,
        },
        {
          provide: FamilyLoanPaymentService,
          useValue: familyLoanPaymentService,
        },
      ],
    }).compile();

    service = module.get(RecurringTransactionService);
  });

  const managerRepo = () =>
    (
      recurringRepo as unknown as {
        _managerRepo: { findOne: jest.Mock; save: jest.Mock };
      }
    )._managerRepo;

  it('creates a recurring income schedule without executing', async () => {
    const result = await service.create('user-1', {
      account_id: 'acc-1',
      category_id: 'cat-1',
      target_module: 'INCOME',
      name: 'Monthly Salary',
      transaction_type: 'INCOME',
      amount_cents: 500000,
      frequency: 'MONTHLY',
      start_date: '2026-01-01',
      income_source: 'SALARY',
    });

    expect(incomeService.create).not.toHaveBeenCalled();
    expect(recurringRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetModule: 'INCOME',
        amountCents: 500000,
        frequency: 'MONTHLY',
        isActive: true,
        executionPayload: { income_source: 'SALARY' },
      }),
    );
    expect(result.name).toBe('Monthly Salary');
  });

  it('rejects create without category_id', async () => {
    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        target_module: 'EXPENSE',
        name: 'Rent',
        transaction_type: 'EXPENSE',
        amount_cents: 100000,
        frequency: 'MONTHLY',
        start_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        target_module: 'EXPENSE',
        name: 'Rent',
        transaction_type: 'EXPENSE',
        amount_cents: 0,
        frequency: 'MONTHLY',
        start_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('executes INCOME via IncomeService and advances next date', async () => {
    const row = baseRow();
    managerRepo().findOne.mockResolvedValue({ ...row });

    await service.executeOne(row, { force: false });

    expect(incomeService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        account_id: 'acc-1',
        income_source: 'SALARY',
        amount_cents: 500000,
      }),
    );
    expect(managerRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastExecutionDate: row.nextExecutionDate,
        retryCount: 0,
        nextExecutionDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    );
  });

  it('executes HOUSE_LOAN_PAYMENT via HouseLoanPaymentService', async () => {
    const row = baseRow({
      targetModule: 'HOUSE_LOAN_PAYMENT',
      transactionType: 'PAYMENT',
      targetReferenceId: 'hl-1',
      executionPayload: { payment_type: 'MONTHLY_INSTALLMENT' },
    });
    managerRepo().findOne.mockResolvedValue({ ...row });

    await service.executeOne(row, { force: true });

    expect(houseLoanPaymentService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        house_loan_id: 'hl-1',
        payment_account_id: 'acc-1',
        payment_type: 'MONTHLY_INSTALLMENT',
      }),
    );
  });

  it('executes SAVINGS deposit via SavingsService', async () => {
    const row = baseRow({
      targetModule: 'SAVINGS',
      transactionType: 'SAVINGS_DEPOSIT',
      targetReferenceId: 'sav-1',
      executionPayload: null,
    });
    managerRepo().findOne.mockResolvedValue({ ...row });

    await service.executeOne(row, { force: true });

    expect(savingsService.deposit).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        savings_id: 'sav-1',
        amount_cents: 500000,
      }),
    );
  });

  it('increments retry_count and stores last_error on failure', async () => {
    const row = baseRow();
    incomeService.create.mockRejectedValue(new Error('Insufficient funds'));
    managerRepo().findOne.mockResolvedValue({ ...row });

    await expect(
      service.executeOne(row, { force: false }),
    ).rejects.toThrow('Insufficient funds');

    expect(managerRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 1,
        lastError: 'Insufficient funds',
      }),
    );
  });

  it('pauses schedule when max retries reached', async () => {
    const row = baseRow({ retryCount: 2, maxRetryCount: 3 });
    incomeService.create.mockRejectedValue(new Error('fail'));
    managerRepo().findOne.mockResolvedValue({ ...row });

    await expect(service.executeOne(row, { force: false })).rejects.toThrow(
      'fail',
    );

    expect(managerRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 3,
        isActive: false,
      }),
    );
  });

  it('pauses and resumes a schedule', async () => {
    recurringRepo.findOne.mockResolvedValue(baseRow());

    const paused = await service.pause('user-1', 'rt-1');
    expect(paused.isActive).toBe(false);

    recurringRepo.findOne.mockResolvedValue(baseRow({ isActive: false }));
    const resumed = await service.resume('user-1', 'rt-1');
    expect(resumed.isActive).toBe(true);
  });

  it('forbids access to another user schedule', async () => {
    recurringRepo.findOne.mockResolvedValue(baseRow({ userId: 'other' }));

    await expect(
      service.findByIdForUser('user-1', 'rt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for missing schedule', async () => {
    recurringRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calculates next execution for weekly frequency', () => {
    const next = service.calculateNextExecutionDate(
      new Date('2026-03-01T00:00:00.000Z'),
      'WEEKLY',
      2,
    );
    expect(next.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });
});
