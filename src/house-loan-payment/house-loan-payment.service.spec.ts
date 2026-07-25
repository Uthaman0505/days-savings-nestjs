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
import { HouseLoanService } from '../house-loan/house-loan.service';
import { TransactionService } from '../transaction/transaction.service';
import { HouseLoanPayment } from './house-loan-payment.entity';
import { HouseLoanPaymentService } from './house-loan-payment.service';

describe('HouseLoanPaymentService', () => {
  let service: HouseLoanPaymentService;
  let paymentsRepo: jest.Mocked<
    Pick<
      Repository<HouseLoanPayment>,
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
  let houseLoanService: {
    findByIdForUser: jest.Mock;
    applyPayment: jest.Mock;
    reversePayment: jest.Mock;
  };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };

  const basePayment = (
    overrides: Partial<HouseLoanPayment> = {},
  ): HouseLoanPayment =>
    ({
      id: 'hlp-1',
      userId: 'user-1',
      houseLoanId: 'hl-1',
      paymentAccountId: 'acc-1',
      transactionId: 'tx-1',
      amountCents: 250000,
      paymentDate: new Date('2026-03-01T00:00:00.000Z'),
      paymentType: 'MONTHLY_INSTALLMENT',
      referenceNumber: null,
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as HouseLoanPayment;

  beforeEach(async () => {
    const managerPaymentRepo = {
      create: jest.fn((x: Partial<HouseLoanPayment>) => x as HouseLoanPayment),
      save: jest.fn(async (x: HouseLoanPayment) => ({
        ...x,
        id: x.id ?? 'hlp-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: HouseLoanPayment) => x),
    };

    paymentsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as HouseLoanPayment),
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
      findOne: jest.fn(
        async () =>
          ({
            id: 'acc-1',
            currentBalanceCents: 500000,
          }) as Account,
      ),
    };

    transactionService = {
      create: jest.fn(async () => ({ id: 'tx-1' })),
      update: jest.fn(async () => ({ id: 'tx-1' })),
      delete: jest.fn(async () => true),
    };

    houseLoanService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'hl-1',
        isActive: true,
        currentBalanceCents: 45000000,
        principalAmountCents: 50000000,
      })),
      applyPayment: jest.fn(async () => ({ id: 'hl-1' })),
      reversePayment: jest.fn(async () => ({ id: 'hl-1' })),
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
        HouseLoanPaymentService,
        {
          provide: getRepositoryToken(HouseLoanPayment),
          useValue: paymentsRepo,
        },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: HouseLoanService, useValue: houseLoanService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(HouseLoanPaymentService);
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

  it('creates payment via TransactionService with LOAN_PAYMENT type', async () => {
    const result = await service.create('user-1', {
      house_loan_id: 'hl-1',
      payment_account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 250000,
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
      payment_type: 'MONTHLY_INSTALLMENT',
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'LOAN_PAYMENT',
        account_id: 'acc-1',
        amount_cents: 250000,
      }),
      expect.anything(),
    );
    expect(houseLoanService.applyPayment).toHaveBeenCalledWith(
      'user-1',
      'hl-1',
      250000,
      expect.anything(),
    );
    expect(result.transactionId).toBe('tx-1');
    expect(result.paymentType).toBe('MONTHLY_INSTALLMENT');
  });

  it('rejects payment above current loan balance', async () => {
    houseLoanService.findByIdForUser.mockResolvedValue({
      id: 'hl-1',
      isActive: true,
      currentBalanceCents: 100000,
    });

    await expect(
      service.create('user-1', {
        house_loan_id: 'hl-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 250000,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
        payment_type: 'MONTHLY_INSTALLMENT',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        house_loan_id: 'hl-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 0,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
        payment_type: 'MONTHLY_INSTALLMENT',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user payment', async () => {
    paymentsRepo.findOne.mockResolvedValue(
      basePayment({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'hlp-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when payment is missing', async () => {
    paymentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates payment by reversing then re-applying loan balances', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    const result = await service.update('user-1', 'hlp-1', {
      amount_cents: 200000,
      payment_type: 'PARTIAL_PAYMENT',
    });

    expect(houseLoanService.reversePayment).toHaveBeenCalledWith(
      'user-1',
      'hl-1',
      250000,
      expect.anything(),
    );
    expect(houseLoanService.applyPayment).toHaveBeenCalledWith(
      'user-1',
      'hl-1',
      200000,
      expect.anything(),
    );
    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.objectContaining({ amount_cents: 200000 }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(200000);
    expect(result.paymentType).toBe('PARTIAL_PAYMENT');
  });

  it('deletes payment, ledger entry, and restores loan balance', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    await expect(service.delete('user-1', 'hlp-1')).resolves.toBe(true);
    expect(managerPaymentRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
    expect(houseLoanService.reversePayment).toHaveBeenCalledWith(
      'user-1',
      'hl-1',
      250000,
      expect.anything(),
    );
  });
});
