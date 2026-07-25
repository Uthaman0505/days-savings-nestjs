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
import { Category } from '../category/category.entity';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import { Transfer } from './transfer.entity';
import { TransferService } from './transfer.service';

describe('TransferService', () => {
  let service: TransferService;
  let transferRepo: jest.Mocked<
    Pick<
      Repository<Transfer>,
      'find' | 'findOne' | 'create' | 'save' | 'remove' | 'createQueryBuilder'
    >
  > & {
    manager: { transaction: jest.Mock };
  };
  let accountsRepo: jest.Mocked<Pick<Repository<Account>, 'findOne'>>;
  let transactionService: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let accountService: {
    findByIdForUser: jest.Mock;
  };
  let categoryService: {
    assertAssignable: jest.Mock;
  };

  const baseTransfer = (overrides: Partial<Transfer> = {}): Transfer =>
    ({
      id: 'tr-1',
      userId: 'user-1',
      fromAccountId: 'acc-from',
      toAccountId: 'acc-to',
      outTransactionId: 'tx-out',
      inTransactionId: 'tx-in',
      amountCents: 5000,
      transferDate: new Date('2026-03-01T00:00:00.000Z'),
      referenceNumber: null,
      description: 'Move to Wise',
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as Transfer;

  const baseAccount = (overrides: Partial<Account> = {}): Account =>
    ({
      id: 'acc-from',
      userId: 'user-1',
      accountName: 'Maybank',
      accountType: 'BANK',
      bankName: 'Maybank',
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
      name: 'Internal Transfer',
      description: null,
      type: 'TRANSFER',
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
    const managerTransferRepo = {
      create: jest.fn((x: Partial<Transfer>) => x as Transfer),
      save: jest.fn(async (x: Transfer) => ({
        ...x,
        id: x.id ?? 'tr-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: Transfer) => x),
    };

    transferRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Transfer),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: () => managerTransferRepo,
          }),
        ),
      },
    };

    (
      transferRepo as unknown as {
        _managerTransferRepo: typeof managerTransferRepo;
      }
    )._managerTransferRepo = managerTransferRepo;

    accountsRepo = {
      findOne: jest.fn(async () => baseAccount()),
    };

    transactionService = {
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'tx-out' })
        .mockResolvedValueOnce({ id: 'tx-in' }),
      update: jest.fn(async () => ({ id: 'tx-out' })),
      delete: jest.fn(async () => true),
    };

    accountService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'acc-from',
        isArchived: false,
        currentBalance: 100,
      })),
    };

    categoryService = {
      assertAssignable: jest.fn(async () => baseCategory()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferService,
        { provide: getRepositoryToken(Transfer), useValue: transferRepo },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(TransferService);
  });

  const managerTransferRepo = () =>
    (
      transferRepo as unknown as {
        _managerTransferRepo: {
          create: jest.Mock;
          save: jest.Mock;
          findOne: jest.Mock;
          remove: jest.Mock;
        };
      }
    )._managerTransferRepo;

  it('creates transfer with TRANSFER_OUT and TRANSFER_IN ledger entries', async () => {
    const result = await service.create('user-1', {
      from_account_id: 'acc-from',
      to_account_id: 'acc-to',
      category_id: 'cat-1',
      amount_cents: 5000,
      transfer_date: new Date('2026-03-01T00:00:00.000Z'),
      description: 'Move to Wise',
    });

    expect(transactionService.create).toHaveBeenCalledTimes(2);
    expect(transactionService.create).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({
        transaction_type: 'TRANSFER_OUT',
        account_id: 'acc-from',
        amount_cents: 5000,
      }),
      expect.anything(),
    );
    expect(transactionService.create).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({
        transaction_type: 'TRANSFER_IN',
        account_id: 'acc-to',
        amount_cents: 5000,
      }),
      expect.anything(),
    );
    expect(managerTransferRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        outTransactionId: 'tx-out',
        inTransactionId: 'tx-in',
        amountCents: 5000,
      }),
    );
    expect(result.outTransactionId).toBe('tx-out');
    expect(result.inTransactionId).toBe('tx-in');
  });

  it('rejects same source and destination account', async () => {
    await expect(
      service.create('user-1', {
        from_account_id: 'acc-1',
        to_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 1000,
        transfer_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        from_account_id: 'acc-from',
        to_account_id: 'acc-to',
        category_id: 'cat-1',
        amount_cents: 0,
        transfer_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects insufficient balance', async () => {
    accountsRepo.findOne.mockResolvedValue(
      baseAccount({ currentBalanceCents: 100 }),
    );

    await expect(
      service.create('user-1', {
        from_account_id: 'acc-from',
        to_account_id: 'acc-to',
        category_id: 'cat-1',
        amount_cents: 5000,
        transfer_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-TRANSFER categories', async () => {
    categoryService.assertAssignable.mockResolvedValue(
      baseCategory({ type: 'EXPENSE' }),
    );

    await expect(
      service.create('user-1', {
        from_account_id: 'acc-from',
        to_account_id: 'acc-to',
        category_id: 'cat-1',
        amount_cents: 1000,
        transfer_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user transfer', async () => {
    transferRepo.findOne.mockResolvedValue(
      baseTransfer({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'tr-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when transfer is missing', async () => {
    transferRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates both ledger legs through TransactionService', async () => {
    transferRepo.findOne.mockResolvedValue(baseTransfer());
    managerTransferRepo().findOne.mockResolvedValue(baseTransfer());
    accountsRepo.findOne.mockResolvedValue(
      baseAccount({ currentBalanceCents: 5000 }),
    );

    const result = await service.update('user-1', 'tr-1', {
      amount_cents: 7000,
    });

    expect(transactionService.update).toHaveBeenCalledTimes(2);
    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-out',
      expect.objectContaining({ amount_cents: 7000 }),
      expect.anything(),
    );
    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-in',
      expect.objectContaining({ amount_cents: 7000 }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(7000);
  });

  it('deletes transfer then both ledger legs', async () => {
    transferRepo.findOne.mockResolvedValue(baseTransfer());
    managerTransferRepo().findOne.mockResolvedValue(baseTransfer());

    await expect(service.delete('user-1', 'tr-1')).resolves.toBe(true);
    expect(managerTransferRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-out',
      expect.anything(),
    );
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-in',
      expect.anything(),
    );
  });
});
