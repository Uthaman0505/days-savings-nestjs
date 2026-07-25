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
import { InsuranceService } from '../insurance/insurance.service';
import { TransactionService } from '../transaction/transaction.service';
import { InsurancePayment } from './insurance-payment.entity';
import { InsurancePaymentService } from './insurance-payment.service';

describe('InsurancePaymentService', () => {
  let service: InsurancePaymentService;
  let paymentsRepo: jest.Mocked<
    Pick<
      Repository<InsurancePayment>,
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
  let insuranceService: {
    findByIdForUser: jest.Mock;
    applyPremiumPayment: jest.Mock;
    reversePremiumPayment: jest.Mock;
  };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };

  const basePayment = (
    overrides: Partial<InsurancePayment> = {},
  ): InsurancePayment =>
    ({
      id: 'ip-1',
      userId: 'user-1',
      insuranceId: 'ins-1',
      paymentAccountId: 'acc-1',
      transactionId: 'tx-1',
      amountCents: 20000,
      paymentDate: new Date('2026-03-01T00:00:00.000Z'),
      paymentType: 'MONTHLY',
      coveragePeriodStart: '2026-03-01',
      coveragePeriodEnd: '2026-03-31',
      previousRenewalDate: '2026-03-01',
      previousLastPaymentDate: null,
      referenceNumber: null,
      notes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as InsurancePayment;

  beforeEach(async () => {
    const managerPaymentRepo = {
      create: jest.fn((x: Partial<InsurancePayment>) => x as InsurancePayment),
      save: jest.fn(async (x: InsurancePayment) => ({
        ...x,
        id: x.id ?? 'ip-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: InsurancePayment) => x),
    };

    paymentsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as InsurancePayment),
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
            currentBalanceCents: 100000,
          }) as Account,
      ),
    };

    transactionService = {
      create: jest.fn(async () => ({ id: 'tx-1' })),
      update: jest.fn(async () => ({ id: 'tx-1' })),
      delete: jest.fn(async () => true),
    };

    insuranceService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'ins-1',
        isActive: true,
        renewalDate: '2026-03-01',
        lastPaymentDate: null,
      })),
      applyPremiumPayment: jest.fn(async () => ({
        policy: { id: 'ins-1' },
        previousRenewalDate: '2026-03-01',
        previousLastPaymentDate: null,
      })),
      reversePremiumPayment: jest.fn(async () => ({ id: 'ins-1' })),
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
        InsurancePaymentService,
        {
          provide: getRepositoryToken(InsurancePayment),
          useValue: paymentsRepo,
        },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: InsuranceService, useValue: insuranceService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(InsurancePaymentService);
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

  it('creates payment via TransactionService with INSURANCE_PAYMENT type', async () => {
    const result = await service.create('user-1', {
      insurance_id: 'ins-1',
      payment_account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 20000,
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
      payment_type: 'MONTHLY',
      coverage_period_start: '2026-03-01',
      coverage_period_end: '2026-03-31',
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'INSURANCE_PAYMENT',
        account_id: 'acc-1',
        amount_cents: 20000,
      }),
      expect.anything(),
    );
    expect(insuranceService.applyPremiumPayment).toHaveBeenCalledWith(
      'user-1',
      'ins-1',
      expect.objectContaining({
        paymentDate: '2026-03-01',
        coveragePeriodEnd: '2026-03-31',
      }),
      expect.anything(),
    );
    expect(result.transactionId).toBe('tx-1');
    expect(result.paymentType).toBe('MONTHLY');
  });

  it('rejects coverage end before coverage start', async () => {
    await expect(
      service.create('user-1', {
        insurance_id: 'ins-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 20000,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
        payment_type: 'MONTHLY',
        coverage_period_start: '2026-03-31',
        coverage_period_end: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        insurance_id: 'ins-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 0,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
        payment_type: 'MONTHLY',
        coverage_period_start: '2026-03-01',
        coverage_period_end: '2026-03-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user payment', async () => {
    paymentsRepo.findOne.mockResolvedValue(
      basePayment({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'ip-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when payment is missing', async () => {
    paymentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates payment and refreshes insurance metadata', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    const result = await service.update('user-1', 'ip-1', {
      amount_cents: 25000,
      coverage_period_end: '2026-04-30',
    });

    expect(insuranceService.reversePremiumPayment).toHaveBeenCalled();
    expect(insuranceService.applyPremiumPayment).toHaveBeenCalled();
    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.objectContaining({ amount_cents: 25000 }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(25000);
  });

  it('deletes payment, ledger entry, and restores insurance metadata', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    await expect(service.delete('user-1', 'ip-1')).resolves.toBe(true);
    expect(managerPaymentRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
    expect(insuranceService.reversePremiumPayment).toHaveBeenCalledWith(
      'user-1',
      'ins-1',
      expect.objectContaining({
        previousRenewalDate: '2026-03-01',
        previousLastPaymentDate: null,
      }),
      expect.anything(),
    );
  });
});
