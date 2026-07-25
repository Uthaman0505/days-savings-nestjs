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
import { CreditCardService } from '../credit-card/credit-card.service';
import { TransactionService } from '../transaction/transaction.service';
import { CreditCardPayment } from './credit-card-payment.entity';
import { CreditCardPaymentService } from './credit-card-payment.service';

describe('CreditCardPaymentService', () => {
  let service: CreditCardPaymentService;
  let paymentsRepo: jest.Mocked<
    Pick<
      Repository<CreditCardPayment>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
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
  let creditCardService: {
    findByIdForUser: jest.Mock;
    applyPayment: jest.Mock;
    reversePayment: jest.Mock;
  };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };

  const basePayment = (
    overrides: Partial<CreditCardPayment> = {},
  ): CreditCardPayment =>
    ({
      id: 'pay-1',
      userId: 'user-1',
      creditCardId: 'cc-1',
      paymentAccountId: 'acc-1',
      transactionId: 'tx-1',
      amountCents: 50000,
      paymentDate: new Date('2026-03-01T00:00:00.000Z'),
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: null,
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as CreditCardPayment;

  beforeEach(async () => {
    const managerPaymentRepo = {
      create: jest.fn((x: Partial<CreditCardPayment>) => x as CreditCardPayment),
      save: jest.fn(async (x: CreditCardPayment) => ({
        ...x,
        id: x.id ?? 'pay-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: CreditCardPayment) => x),
    };

    paymentsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as CreditCardPayment),
      save: jest.fn(),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: () => managerPaymentRepo,
          }),
        ),
      },
    };

    (
      paymentsRepo as unknown as {
        _managerPaymentRepo: typeof managerPaymentRepo;
      }
    )._managerPaymentRepo = managerPaymentRepo;

    accountsRepo = {
      findOne: jest.fn(async () =>
        ({
          id: 'acc-1',
          currentBalanceCents: 200000,
        }) as Account,
      ),
    };

    transactionService = {
      create: jest.fn(async () => ({ id: 'tx-1' })),
      update: jest.fn(async () => ({ id: 'tx-1' })),
      delete: jest.fn(async () => true),
    };

    creditCardService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'cc-1',
        isActive: true,
        outstandingBalanceCents: 100000,
        availableLimitCents: 900000,
        creditLimitCents: 1000000,
      })),
      applyPayment: jest.fn(async () => ({ id: 'cc-1' })),
      reversePayment: jest.fn(async () => ({ id: 'cc-1' })),
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
        CreditCardPaymentService,
        {
          provide: getRepositoryToken(CreditCardPayment),
          useValue: paymentsRepo,
        },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: CreditCardService, useValue: creditCardService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(CreditCardPaymentService);
  });

  const managerPaymentRepo = () =>
    (
      paymentsRepo as unknown as {
        _managerPaymentRepo: {
          create: jest.Mock;
          save: jest.Mock;
          findOne: jest.Mock;
          remove: jest.Mock;
        };
      }
    )._managerPaymentRepo;

  it('creates payment via TransactionService and applies card payment', async () => {
    const result = await service.create('user-1', {
      credit_card_id: 'cc-1',
      payment_account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 50000,
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
      payment_method: 'BANK_TRANSFER',
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'CREDIT_CARD_PAYMENT',
        account_id: 'acc-1',
        amount_cents: 50000,
      }),
      expect.anything(),
    );
    expect(creditCardService.applyPayment).toHaveBeenCalledWith(
      'user-1',
      'cc-1',
      50000,
      expect.anything(),
    );
    expect(result.transactionId).toBe('tx-1');
    expect(result.amountCents).toBe(50000);
  });

  it('rejects payment above outstanding balance', async () => {
    creditCardService.findByIdForUser.mockResolvedValue({
      id: 'cc-1',
      isActive: true,
      outstandingBalanceCents: 10000,
    });

    await expect(
      service.create('user-1', {
        credit_card_id: 'cc-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 50000,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
        payment_method: 'BANK_TRANSFER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        credit_card_id: 'cc-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 0,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
        payment_method: 'BANK_TRANSFER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user payment', async () => {
    paymentsRepo.findOne.mockResolvedValue(
      basePayment({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'pay-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when payment is missing', async () => {
    paymentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates payment by reversing then re-applying card balances', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    const result = await service.update('user-1', 'pay-1', {
      amount_cents: 30000,
    });

    expect(creditCardService.reversePayment).toHaveBeenCalledWith(
      'user-1',
      'cc-1',
      50000,
      expect.anything(),
    );
    expect(creditCardService.applyPayment).toHaveBeenCalledWith(
      'user-1',
      'cc-1',
      30000,
      expect.anything(),
    );
    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.objectContaining({ amount_cents: 30000 }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(30000);
  });

  it('deletes payment, ledger entry, and restores card outstanding', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    await expect(service.delete('user-1', 'pay-1')).resolves.toBe(true);
    expect(managerPaymentRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
    expect(creditCardService.reversePayment).toHaveBeenCalledWith(
      'user-1',
      'cc-1',
      50000,
      expect.anything(),
    );
  });
});
