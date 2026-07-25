import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../account/account.entity';
import { Category } from '../category/category.entity';
import { Transaction } from './transaction.entity';
import { TransactionService } from './transaction.service';

describe('TransactionService', () => {
  let service: TransactionService;
  let txRepo: jest.Mocked<
    Pick<
      Repository<Transaction>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  > & {
    manager: { transaction: jest.Mock };
  };
  let accountsRepo: jest.Mocked<
    Pick<Repository<Account>, 'findOne' | 'save'>
  >;
  let categoriesRepo: jest.Mocked<Pick<Repository<Category>, 'findOne'>>;

  const baseAccount = (overrides: Partial<Account> = {}): Account =>
    ({
      id: 'acc-1',
      userId: 'user-1',
      accountName: 'Cash',
      accountType: 'CASH',
      bankName: null,
      accountNumber: null,
      currencyCode: 'MYR',
      openingBalanceCents: 10000,
      currentBalanceCents: 10000,
      color: null,
      icon: null,
      displayOrder: 0,
      isDefault: true,
      isArchived: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Account;

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

  const baseTx = (overrides: Partial<Transaction> = {}): Transaction =>
    ({
      id: 'tx-1',
      userId: 'user-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      transactionType: 'INCOME',
      amountCents: 5000,
      transactionDate: new Date('2026-03-01T00:00:00.000Z'),
      description: 'Pay',
      referenceNumber: null,
      notes: null,
      status: 'COMPLETED',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as Transaction;

  beforeEach(async () => {
    accountsRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x as Account),
    };

    categoriesRepo = {
      findOne: jest.fn(),
    };

    const managerAccountsRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
        const account = await accountsRepo.findOne({ where });
        return account;
      }),
      save: jest.fn(async (x: Account) => {
        await accountsRepo.save(x);
        return x;
      }),
    };

    const managerTxRepo = {
      create: jest.fn((x: Partial<Transaction>) => x as Transaction),
      save: jest.fn(async (x: Transaction) => ({
        ...x,
        id: x.id ?? 'tx-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: Transaction) => x),
    };

    txRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Transaction),
      save: jest.fn(),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: (entity: unknown) => {
              if (entity === Transaction) return managerTxRepo;
              if (entity === Account) return managerAccountsRepo;
              throw new Error('Unexpected repository');
            },
          }),
        ),
      },
    };

    // Expose manager repos for assertions via closure on txRepo.manager
    (txRepo as unknown as { _managerTxRepo: typeof managerTxRepo })._managerTxRepo =
      managerTxRepo;
    (
      txRepo as unknown as { _managerAccountsRepo: typeof managerAccountsRepo }
    )._managerAccountsRepo = managerAccountsRepo;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: getRepositoryToken(Category), useValue: categoriesRepo },
      ],
    }).compile();

    service = module.get(TransactionService);
  });

  const managerTxRepo = () =>
    (txRepo as unknown as { _managerTxRepo: {
      create: jest.Mock;
      save: jest.Mock;
      findOne: jest.Mock;
      remove: jest.Mock;
    } })._managerTxRepo;

  it('creates an income transaction and increases account balance', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount());
    categoriesRepo.findOne.mockResolvedValue(baseCategory());

    const result = await service.create('user-1', {
      account_id: 'acc-1',
      category_id: 'cat-1',
      transaction_type: 'INCOME',
      amount_cents: 2500,
      transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      description: 'Salary',
    });

    expect(managerTxRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        transactionType: 'INCOME',
        amountCents: 2500,
        status: 'COMPLETED',
      }),
    );
    expect(accountsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentBalanceCents: 12500 }),
    );
    expect(result.amountCents).toBe(2500);
    expect(result.transactionType).toBe('INCOME');
  });

  it('decreases balance for expense transactions', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount());
    categoriesRepo.findOne.mockResolvedValue(
      baseCategory({ type: 'EXPENSE', name: 'Food' }),
    );

    await service.create('user-1', {
      account_id: 'acc-1',
      category_id: 'cat-1',
      transaction_type: 'EXPENSE',
      amount_cents: 1500,
      transaction_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(accountsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentBalanceCents: 8500 }),
    );
  });

  it('does not change balance for pending transactions', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount());
    categoriesRepo.findOne.mockResolvedValue(baseCategory());

    await service.create('user-1', {
      account_id: 'acc-1',
      category_id: 'cat-1',
      transaction_type: 'INCOME',
      amount_cents: 2500,
      transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      status: 'PENDING',
    });

    expect(accountsRepo.save).not.toHaveBeenCalled();
  });

  it('rejects zero or negative amounts', async () => {
    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        transaction_type: 'INCOME',
        amount_cents: 0,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        transaction_type: 'INCOME',
        amount_cents: -100,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects another user account', async () => {
    accountsRepo.findOne.mockResolvedValue(
      baseAccount({ userId: 'other-user' }),
    );

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        transaction_type: 'INCOME',
        amount_cents: 100,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects archived accounts and categories', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount({ isArchived: true }));

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        transaction_type: 'INCOME',
        amount_cents: 100,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    accountsRepo.findOne.mockResolvedValue(baseAccount());
    categoriesRepo.findOne.mockResolvedValue(
      baseCategory({ isArchived: true }),
    );

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        transaction_type: 'INCOME',
        amount_cents: 100,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows system categories', async () => {
    accountsRepo.findOne.mockResolvedValue(baseAccount());
    categoriesRepo.findOne.mockResolvedValue(
      baseCategory({
        userId: null,
        isSystem: true,
        name: 'Salary',
      }),
    );

    await expect(
      service.create('user-1', {
        account_id: 'acc-1',
        category_id: 'cat-1',
        transaction_type: 'INCOME',
        amount_cents: 100,
        transaction_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ amountCents: 100 });
  });

  it('forbids access to another user transaction', async () => {
    txRepo.findOne.mockResolvedValue(baseTx({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'tx-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when transaction is missing', async () => {
    txRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists transactions for the user with newest first by default', async () => {
    txRepo.find.mockResolvedValue([
      baseTx({ id: 'tx-2', amountCents: 200 }),
      baseTx({ id: 'tx-1', amountCents: 100 }),
    ]);

    const rows = await service.findMyTransactions('user-1');

    expect(txRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        order: { transactionDate: 'DESC', createdAt: 'DESC' },
        take: 50,
        skip: 0,
      }),
    );
    expect(rows).toHaveLength(2);
  });

  it('reverses balance when deleting a completed transaction', async () => {
    txRepo.findOne.mockResolvedValue(baseTx({ amountCents: 2000 }));
    managerTxRepo().findOne.mockResolvedValue(
      baseTx({ amountCents: 2000 }),
    );
    accountsRepo.findOne.mockResolvedValue(
      baseAccount({ currentBalanceCents: 12000 }),
    );

    await expect(service.delete('user-1', 'tx-1')).resolves.toBe(true);
    expect(managerTxRepo().remove).toHaveBeenCalled();
    expect(accountsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentBalanceCents: 10000 }),
    );
  });

  it('updates amount and adjusts balance delta', async () => {
    const existing = baseTx({ amountCents: 2000, transactionType: 'INCOME' });
    txRepo.findOne.mockResolvedValue(existing);
    managerTxRepo().findOne.mockResolvedValue({ ...existing });
    accountsRepo.findOne.mockResolvedValue(
      baseAccount({ currentBalanceCents: 12000 }),
    );

    const result = await service.update('user-1', 'tx-1', {
      amount_cents: 3000,
    });

    expect(result.amountCents).toBe(3000);
    expect(accountsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentBalanceCents: 13000 }),
    );
  });
});
