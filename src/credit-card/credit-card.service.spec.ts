import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountService } from '../account/account.service';
import { CreditCard } from './credit-card.entity';
import { CreditCardService } from './credit-card.service';

describe('CreditCardService', () => {
  let service: CreditCardService;
  let repo: jest.Mocked<
    Pick<
      Repository<CreditCard>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  >;
  let accountService: { findByIdForUser: jest.Mock };

  const baseCard = (overrides: Partial<CreditCard> = {}): CreditCard =>
    ({
      id: 'cc-1',
      userId: 'user-1',
      accountId: null,
      cardName: 'Maybank Visa',
      bankName: 'Maybank',
      cardNetwork: 'VISA',
      lastFourDigits: '1234',
      creditLimitCents: 1000000,
      availableLimitCents: 1000000,
      outstandingBalanceCents: 0,
      statementDay: 15,
      paymentDueDay: 5,
      currency: 'MYR',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as CreditCard;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as CreditCard),
      save: jest.fn(async (x) => {
        const entity = x as CreditCard;
        return {
          ...entity,
          id: entity.id ?? 'cc-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as CreditCard;
      }),
      remove: jest.fn(),
    };

    accountService = {
      findByIdForUser: jest.fn(async () => ({ id: 'acc-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditCardService,
        { provide: getRepositoryToken(CreditCard), useValue: repo },
        { provide: AccountService, useValue: accountService },
      ],
    }).compile();

    service = module.get(CreditCardService);
  });

  it('creates a credit card and computes available limit', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      card_name: '  Maybank Visa  ',
      bank_name: 'Maybank',
      card_network: 'VISA',
      last_four_digits: '1234',
      credit_limit_cents: 1000000,
      outstanding_balance_cents: 250000,
      statement_day: 15,
      payment_due_day: 5,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        cardName: 'Maybank Visa',
        creditLimitCents: 1000000,
        outstandingBalanceCents: 250000,
        availableLimitCents: 750000,
        isActive: true,
      }),
    );
    expect(result.availableLimitCents).toBe(750000);
  });

  it('rejects duplicate card names for the same user', async () => {
    repo.findOne.mockResolvedValue(baseCard());

    await expect(
      service.create('user-1', {
        card_name: 'Maybank Visa',
        bank_name: 'Maybank',
        card_network: 'VISA',
        last_four_digits: '9999',
        credit_limit_cents: 500000,
        statement_day: 1,
        payment_due_day: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects outstanding balance above credit limit', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        card_name: 'CIMB Mastercard',
        bank_name: 'CIMB',
        card_network: 'MASTERCARD',
        last_four_digits: '4321',
        credit_limit_cents: 100000,
        outstanding_balance_cents: 150000,
        statement_day: 10,
        payment_due_day: 25,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid statement day', async () => {
    await expect(
      service.create('user-1', {
        card_name: 'HLB Visa',
        bank_name: 'HLB',
        card_network: 'VISA',
        last_four_digits: '1111',
        credit_limit_cents: 200000,
        statement_day: 32,
        payment_due_day: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user card', async () => {
    repo.findOne.mockResolvedValue(baseCard({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'cc-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when card is missing', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists active cards only', async () => {
    repo.find.mockResolvedValue([baseCard()]);

    const rows = await service.findActiveCreditCards('user-1');

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', isActive: true },
      order: { cardName: 'ASC', createdAt: 'ASC' },
    });
    expect(rows).toHaveLength(1);
  });

  it('archives a card by setting is_active false', async () => {
    repo.findOne.mockResolvedValue(baseCard({ isActive: true }));

    const result = await service.archive('user-1', 'cc-1');

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(result.isActive).toBe(false);
  });

  it('updates limits and recalculates available limit', async () => {
    repo.findOne.mockResolvedValueOnce(baseCard()).mockResolvedValueOnce(null);

    const result = await service.update('user-1', 'cc-1', {
      credit_limit_cents: 2000000,
      outstanding_balance_cents: 500000,
    });

    expect(result.creditLimitCents).toBe(2000000);
    expect(result.outstandingBalanceCents).toBe(500000);
    expect(result.availableLimitCents).toBe(1500000);
  });

  it('deletes an owned card', async () => {
    const row = baseCard();
    repo.findOne.mockResolvedValue(row);
    repo.remove.mockResolvedValue(row);

    await expect(service.delete('user-1', 'cc-1')).resolves.toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});
