import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './account.entity';
import { AccountService } from './account.service';

describe('AccountService', () => {
  let service: AccountService;
  let repo: jest.Mocked<
    Pick<
      Repository<Account>,
      'find' | 'findOne' | 'create' | 'save' | 'count' | 'update' | 'remove'
    >
  >;

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

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Account),
      save: jest.fn(async (x) => {
        const entity = x as Account;
        return {
          ...entity,
          id: entity.id ?? 'acc-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as Account;
      }),
      count: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: getRepositoryToken(Account), useValue: repo },
      ],
    }).compile();

    service = module.get(AccountService);
  });

  it('lists accounts for the user ordered by display_order', async () => {
    repo.find.mockResolvedValue([
      baseAccount({ id: 'a', displayOrder: 1, accountName: 'Bank' }),
      baseAccount({ id: 'b', displayOrder: 0, accountName: 'Cash' }),
    ]);

    const rows = await service.findMyAccounts('user-1');

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].openingBalance).toBe(100);
    expect(rows[0].currentBalance).toBe(100);
  });

  it('creates an account and converts opening balance to cents', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.count.mockResolvedValue(0);

    const result = await service.create('user-1', {
      account_name: '  Maybank  ',
      account_type: 'BANK',
      bank_name: 'Maybank',
      opening_balance: 250.5,
      currency_code: 'MYR',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountName: 'Maybank',
        accountType: 'BANK',
        openingBalanceCents: 25050,
        currentBalanceCents: 25050,
        isDefault: true,
        isArchived: false,
      }),
    );
    expect(result.accountName).toBe('Maybank');
    expect(result.openingBalance).toBe(250.5);
    expect(result.isDefault).toBe(true);
  });

  it('rejects duplicate account names for the same user', async () => {
    repo.findOne.mockResolvedValue(baseAccount());

    await expect(
      service.create('user-1', {
        account_name: 'Cash',
        account_type: 'CASH',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears previous default when creating a new default account', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.count.mockResolvedValue(2);
    repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

    await service.create('user-1', {
      account_name: 'Wise',
      account_type: 'WISE',
      is_default: true,
    });

    expect(repo.update).toHaveBeenCalledWith(
      { userId: 'user-1', isDefault: true },
      { isDefault: false },
    );
  });

  it('forbids access to another user account', async () => {
    repo.findOne.mockResolvedValue(baseAccount({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'acc-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when account is missing', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives an account and clears default', async () => {
    repo.findOne.mockResolvedValue(baseAccount({ isDefault: true }));

    const result = await service.archive('user-1', 'acc-1');

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isArchived: true,
        isDefault: false,
      }),
    );
    expect(result.isArchived).toBe(true);
    expect(result.isDefault).toBe(false);
  });

  it('rejects setting an archived account as default', async () => {
    repo.findOne.mockResolvedValue(baseAccount({ isArchived: true }));

    await expect(service.setDefault('user-1', 'acc-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sets default and clears other defaults', async () => {
    repo.findOne.mockResolvedValue(
      baseAccount({ isDefault: false, isArchived: false }),
    );
    repo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

    const result = await service.setDefault('user-1', 'acc-1');

    expect(repo.update).toHaveBeenCalledWith(
      { userId: 'user-1', isDefault: true },
      { isDefault: false },
    );
    expect(result.isDefault).toBe(true);
  });

  it('deletes an owned account', async () => {
    const row = baseAccount();
    repo.findOne.mockResolvedValue(row);
    repo.remove.mockResolvedValue(row);

    await expect(service.delete('user-1', 'acc-1')).resolves.toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });

  it('rejects update that would make an archived account default', async () => {
    repo.findOne.mockResolvedValue(baseAccount({ isArchived: true }));

    await expect(
      service.update('user-1', 'acc-1', { is_default: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
