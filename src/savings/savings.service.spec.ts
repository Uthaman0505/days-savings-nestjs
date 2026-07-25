import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import { Savings } from './savings.entity';
import { SavingsService } from './savings.service';

describe('SavingsService', () => {
  let service: SavingsService;
  let savingsRepo: jest.Mocked<
    Pick<
      Repository<Savings>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  > & {
    manager: { transaction: jest.Mock };
  };
  let accountsRepo: jest.Mocked<Pick<Repository<Account>, 'findOne'>>;
  let transactionService: { create: jest.Mock };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };

  const baseSavings = (overrides: Partial<Savings> = {}): Savings =>
    ({
      id: 'sav-1',
      userId: 'user-1',
      accountId: 'acc-1',
      name: 'Emergency Fund',
      description: null,
      savingType: 'EMERGENCY',
      targetAmountCents: 1000000,
      currentBalanceCents: 100000,
      currency: 'MYR',
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      status: 'ACTIVE',
      isActive: true,
      monthlyDepositCents: null,
      interestRate: null,
      maturityDate: null,
      linkedGoalId: null,
      penaltyRate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Savings;

  beforeEach(async () => {
    const managerSavingsRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: Savings) => ({
        ...x,
        id: x.id ?? 'sav-1',
        createdAt: x.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
      })),
    };

    savingsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Savings),
      save: jest.fn(async (x) => {
        const entity = x as Savings;
        return {
          ...entity,
          id: entity.id ?? 'sav-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as Savings;
      }),
      remove: jest.fn(async (x) => x as Savings),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: () => managerSavingsRepo,
          }),
        ),
      },
    };

    (
      savingsRepo as unknown as {
        _managerSavingsRepo: typeof managerSavingsRepo;
      }
    )._managerSavingsRepo = managerSavingsRepo;

    accountsRepo = {
      findOne: jest.fn(async () =>
        ({
          id: 'acc-1',
          currentBalanceCents: 500000,
        }) as Account,
      ),
    };

    transactionService = {
      create: jest.fn(async () => ({ id: 'tx-1' })),
    };

    accountService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'acc-1',
        isArchived: false,
      })),
    };

    categoryService = {
      assertAssignable: jest.fn(async () => ({ id: 'cat-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingsService,
        { provide: getRepositoryToken(Savings), useValue: savingsRepo },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(SavingsService);
  });

  const managerSavingsRepo = () =>
    (
      savingsRepo as unknown as {
        _managerSavingsRepo: {
          findOne: jest.Mock;
          save: jest.Mock;
        };
      }
    )._managerSavingsRepo;

  it('creates a savings pot without moving money', async () => {
    savingsRepo.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      account_id: 'acc-1',
      name: '  Emergency Fund  ',
      saving_type: 'EMERGENCY',
      target_amount_cents: 1000000,
      start_date: '2026-01-01',
    });

    expect(transactionService.create).not.toHaveBeenCalled();
    expect(savingsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        name: 'Emergency Fund',
        savingType: 'EMERGENCY',
        currentBalanceCents: 0,
        status: 'ACTIVE',
        isActive: true,
      }),
    );
    expect(result.name).toBe('Emergency Fund');
  });

  it('rejects duplicate savings names for the same user', async () => {
    savingsRepo.findOne.mockResolvedValue(baseSavings());

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        name: 'Emergency Fund',
        saving_type: 'EMERGENCY',
        start_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects current balance above target amount', async () => {
    savingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        name: 'Vacation Fund',
        saving_type: 'VACATION',
        target_amount_cents: 100000,
        current_balance_cents: 150000,
        start_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deposits via SAVING_DEPOSIT and completes when target is reached', async () => {
    savingsRepo.findOne.mockResolvedValue(
      baseSavings({ currentBalanceCents: 900000, targetAmountCents: 1000000 }),
    );
    managerSavingsRepo().findOne.mockResolvedValue(
      baseSavings({ currentBalanceCents: 900000, targetAmountCents: 1000000 }),
    );

    const result = await service.deposit('user-1', {
      savings_id: 'sav-1',
      category_id: 'cat-1',
      amount_cents: 100000,
      transaction_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'SAVING_DEPOSIT',
        amount_cents: 100000,
        account_id: 'acc-1',
      }),
      expect.anything(),
    );
    expect(managerSavingsRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({
        currentBalanceCents: 1000000,
        status: 'COMPLETED',
      }),
    );
    expect(result.status).toBe('COMPLETED');
  });

  it('rejects deposit when account balance is insufficient', async () => {
    savingsRepo.findOne.mockResolvedValue(baseSavings());
    accountsRepo.findOne.mockResolvedValue({
      id: 'acc-1',
      currentBalanceCents: 1000,
    } as Account);

    await expect(
      service.deposit('user-1', {
        savings_id: 'sav-1',
        category_id: 'cat-1',
        amount_cents: 50000,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionService.create).not.toHaveBeenCalled();
  });

  it('withdraws via SAVING_WITHDRAW and restores ACTIVE when below target', async () => {
    savingsRepo.findOne.mockResolvedValue(
      baseSavings({
        currentBalanceCents: 1000000,
        targetAmountCents: 1000000,
        status: 'COMPLETED',
      }),
    );
    managerSavingsRepo().findOne.mockResolvedValue(
      baseSavings({
        currentBalanceCents: 1000000,
        targetAmountCents: 1000000,
        status: 'COMPLETED',
      }),
    );

    const result = await service.withdraw('user-1', {
      savings_id: 'sav-1',
      category_id: 'cat-1',
      amount_cents: 100000,
      transaction_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'SAVING_WITHDRAW',
        amount_cents: 100000,
      }),
      expect.anything(),
    );
    expect(result.currentBalanceCents).toBe(900000);
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects withdrawal above savings balance', async () => {
    savingsRepo.findOne.mockResolvedValue(
      baseSavings({ currentBalanceCents: 10000 }),
    );

    await expect(
      service.withdraw('user-1', {
        savings_id: 'sav-1',
        category_id: 'cat-1',
        amount_cents: 50000,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives a savings pot', async () => {
    savingsRepo.findOne.mockResolvedValue(baseSavings());

    const result = await service.archive('user-1', 'sav-1');

    expect(savingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        status: 'ARCHIVED',
      }),
    );
    expect(result.isActive).toBe(false);
  });

  it('rejects delete when balance remains', async () => {
    savingsRepo.findOne.mockResolvedValue(
      baseSavings({ currentBalanceCents: 5000 }),
    );

    await expect(service.delete('user-1', 'sav-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes an empty savings pot', async () => {
    savingsRepo.findOne.mockResolvedValue(
      baseSavings({ currentBalanceCents: 0 }),
    );

    await expect(service.delete('user-1', 'sav-1')).resolves.toBe(true);
    expect(savingsRepo.remove).toHaveBeenCalled();
  });

  it('forbids access to another user savings', async () => {
    savingsRepo.findOne.mockResolvedValue(
      baseSavings({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'sav-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for missing savings', async () => {
    savingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
