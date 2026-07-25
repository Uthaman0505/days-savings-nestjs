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
import { Expense } from './expense.entity';
import { ExpenseService } from './expense.service';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let expenseRepo: jest.Mocked<
    Pick<Repository<Expense>, 'find' | 'findOne' | 'create' | 'save' | 'remove'>
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

  const baseExpense = (overrides: Partial<Expense> = {}): Expense =>
    ({
      id: 'exp-1',
      userId: 'user-1',
      transactionId: 'tx-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      merchantName: 'Starbucks',
      amountCents: 1500,
      expenseDate: new Date('2026-03-01T00:00:00.000Z'),
      description: 'Coffee',
      referenceNumber: null,
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as Expense;

  const baseCategory = (overrides: Partial<Category> = {}): Category =>
    ({
      id: 'cat-1',
      userId: 'user-1',
      name: 'Food & Beverage',
      description: null,
      type: 'EXPENSE',
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
    const managerExpenseRepo = {
      create: jest.fn((x: Partial<Expense>) => x as Expense),
      save: jest.fn(async (x: Expense) => ({
        ...x,
        id: x.id ?? 'exp-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: Expense) => x),
    };

    expenseRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Expense),
      save: jest.fn(),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: () => managerExpenseRepo,
          }),
        ),
      },
    };

    (
      expenseRepo as unknown as {
        _managerExpenseRepo: typeof managerExpenseRepo;
      }
    )._managerExpenseRepo = managerExpenseRepo;

    transactionService = {
      create: jest.fn(async () => ({
        id: 'tx-1',
        userId: 'user-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        transactionType: 'EXPENSE',
        amountCents: 1500,
        transactionDate: new Date('2026-03-01T00:00:00.000Z'),
        description: 'Coffee',
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
      findByIdForUser: jest.fn(async () => ({ id: 'cat-1', type: 'EXPENSE' })),
      assertAssignable: jest.fn(async () => baseCategory()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(ExpenseService);
  });

  const managerExpenseRepo = () =>
    (
      expenseRepo as unknown as {
        _managerExpenseRepo: {
          create: jest.Mock;
          save: jest.Mock;
          findOne: jest.Mock;
          remove: jest.Mock;
        };
      }
    )._managerExpenseRepo;

  it('creates expense via TransactionService with EXPENSE type', async () => {
    const result = await service.create('user-1', {
      account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 1500,
      expense_date: new Date('2026-03-01T00:00:00.000Z'),
      merchant_name: '  Starbucks  ',
      description: 'Coffee',
    });

    expect(categoryService.assertAssignable).toHaveBeenCalledWith(
      'cat-1',
      'user-1',
    );
    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'EXPENSE',
        amount_cents: 1500,
        account_id: 'acc-1',
        category_id: 'cat-1',
        status: 'COMPLETED',
      }),
      expect.anything(),
    );
    expect(managerExpenseRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        transactionId: 'tx-1',
        merchantName: 'Starbucks',
        amountCents: 1500,
      }),
    );
    expect(result.transactionId).toBe('tx-1');
    expect(result.merchantName).toBe('Starbucks');
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 0,
        expense_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-EXPENSE categories', async () => {
    categoryService.assertAssignable.mockResolvedValue(
      baseCategory({ type: 'INCOME', name: 'Salary' }),
    );

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 1000,
        expense_date: new Date('2026-03-01T00:00:00.000Z'),
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
        amount_cents: 1000,
        expense_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user expense', async () => {
    expenseRepo.findOne.mockResolvedValue(
      baseExpense({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'exp-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when expense is missing', async () => {
    expenseRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists expenses newest first by default', async () => {
    expenseRepo.find.mockResolvedValue([baseExpense()]);

    const rows = await service.findMyExpenses('user-1');

    expect(expenseRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        order: { expenseDate: 'DESC', createdAt: 'DESC' },
        take: 50,
        skip: 0,
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it('updates expense and ledger through TransactionService', async () => {
    expenseRepo.findOne.mockResolvedValue(baseExpense());
    managerExpenseRepo().findOne.mockResolvedValue(baseExpense());

    const result = await service.update('user-1', 'exp-1', {
      amount_cents: 2200,
      merchant_name: 'Coffee Bean',
    });

    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.objectContaining({ amount_cents: 2200 }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(2200);
    expect(result.merchantName).toBe('Coffee Bean');
  });

  it('deletes expense then reverses ledger via TransactionService', async () => {
    expenseRepo.findOne.mockResolvedValue(baseExpense());
    managerExpenseRepo().findOne.mockResolvedValue(baseExpense());

    await expect(service.delete('user-1', 'exp-1')).resolves.toBe(true);
    expect(managerExpenseRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
  });
});
