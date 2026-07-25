import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountService } from '../account/account.service';
import { Category } from '../category/category.entity';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import { Income } from './income.entity';
import { IncomeService } from './income.service';

describe('IncomeService', () => {
  let service: IncomeService;
  let incomeRepo: jest.Mocked<
    Pick<Repository<Income>, 'find' | 'findOne' | 'create' | 'save' | 'remove'>
  > & {
    manager: { transaction: jest.Mock };
  };
  let transactionService: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let accountService: {
    findByIdForUser: jest.Mock;
  };
  let categoryService: {
    findByIdForUser: jest.Mock;
    assertAssignable: jest.Mock;
  };

  const baseIncome = (overrides: Partial<Income> = {}): Income =>
    ({
      id: 'inc-1',
      userId: 'user-1',
      transactionId: 'tx-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      incomeSource: 'SALARY',
      amountCents: 5000,
      receivedDate: new Date('2026-03-01T00:00:00.000Z'),
      description: 'March salary',
      referenceNumber: null,
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as Income;

  const baseCategory = (overrides: Partial<Category> = {}): Category =>
    ({
      id: 'cat-1',
      userId: 'user-1',
      name: 'Salary',
      description: null,
      type: 'INCOME',
      icon: null,
      color: null,
      displayOrder: 0,
      isDefault: false,
      isSystem: false,
      isArchived: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Category;

  beforeEach(async () => {
    const managerIncomeRepo = {
      create: jest.fn((x: Partial<Income>) => x as Income),
      save: jest.fn(async (x: Income) => ({
        ...x,
        id: x.id ?? 'inc-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: Income) => x),
    };

    incomeRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Income),
      save: jest.fn(),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: () => managerIncomeRepo,
          }),
        ),
      },
    };

    (incomeRepo as unknown as { _managerIncomeRepo: typeof managerIncomeRepo })._managerIncomeRepo =
      managerIncomeRepo;

    transactionService = {
      create: jest.fn(async () => ({
        id: 'tx-1',
        userId: 'user-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        transactionType: 'INCOME',
        amountCents: 5000,
        transactionDate: new Date('2026-03-01T00:00:00.000Z'),
        description: 'March salary',
        referenceNumber: null,
        notes: null,
        status: 'COMPLETED',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      })),
      update: jest.fn(async () => ({ id: 'tx-1' })),
      delete: jest.fn(async () => true),
    };

    accountService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'acc-1',
        isArchived: false,
      })),
    };

    categoryService = {
      findByIdForUser: jest.fn(async () => ({ id: 'cat-1', type: 'INCOME' })),
      assertAssignable: jest.fn(async () => baseCategory()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomeService,
        { provide: getRepositoryToken(Income), useValue: incomeRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(IncomeService);
  });

  const managerIncomeRepo = () =>
    (
      incomeRepo as unknown as {
        _managerIncomeRepo: {
          create: jest.Mock;
          save: jest.Mock;
          findOne: jest.Mock;
          remove: jest.Mock;
        };
      }
    )._managerIncomeRepo;

  it('creates income via TransactionService and links the ledger entry', async () => {
    const result = await service.create('user-1', {
      account_id: 'acc-1',
      category_id: 'cat-1',
      income_source: 'SALARY',
      amount_cents: 5000,
      received_date: new Date('2026-03-01T00:00:00.000Z'),
      description: 'March salary',
    });

    expect(categoryService.assertAssignable).toHaveBeenCalledWith(
      'cat-1',
      'user-1',
    );
    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'INCOME',
        amount_cents: 5000,
        account_id: 'acc-1',
        category_id: 'cat-1',
        status: 'COMPLETED',
      }),
      expect.anything(),
    );
    expect(managerIncomeRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        transactionId: 'tx-1',
        incomeSource: 'SALARY',
        amountCents: 5000,
      }),
    );
    expect(result.transactionId).toBe('tx-1');
    expect(result.incomeSource).toBe('SALARY');
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        income_source: 'SALARY',
        amount_cents: 0,
        received_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-INCOME categories', async () => {
    categoryService.assertAssignable.mockResolvedValue(
      baseCategory({ type: 'EXPENSE', name: 'Food' }),
    );

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        income_source: 'SALARY',
        amount_cents: 1000,
        received_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects archived accounts', async () => {
    accountService.findByIdForUser.mockResolvedValue({
      id: 'acc-1',
      isArchived: true,
    });

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        income_source: 'SALARY',
        amount_cents: 1000,
        received_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user income', async () => {
    incomeRepo.findOne.mockResolvedValue(baseIncome({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'inc-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when income is missing', async () => {
    incomeRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists income newest first by default', async () => {
    incomeRepo.find.mockResolvedValue([baseIncome()]);

    const rows = await service.findMyIncome('user-1');

    expect(incomeRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        order: { receivedDate: 'DESC', createdAt: 'DESC' },
        take: 50,
        skip: 0,
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it('updates income and ledger through TransactionService', async () => {
    incomeRepo.findOne.mockResolvedValue(baseIncome());
    managerIncomeRepo().findOne.mockResolvedValue(baseIncome());

    const result = await service.update('user-1', 'inc-1', {
      amount_cents: 7500,
      income_source: 'BONUS',
    });

    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.objectContaining({ amount_cents: 7500 }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(7500);
    expect(result.incomeSource).toBe('BONUS');
  });

  it('deletes income then reverses ledger via TransactionService', async () => {
    incomeRepo.findOne.mockResolvedValue(baseIncome());
    managerIncomeRepo().findOne.mockResolvedValue(baseIncome());

    await expect(service.delete('user-1', 'inc-1')).resolves.toBe(true);
    expect(managerIncomeRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
  });
});
