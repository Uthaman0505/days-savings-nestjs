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
import { FamilyLoanService } from '../family-loan/family-loan.service';
import { TransactionService } from '../transaction/transaction.service';
import { FamilyLoanPayment } from './family-loan-payment.entity';
import { FamilyLoanPaymentService } from './family-loan-payment.service';

describe('FamilyLoanPaymentService', () => {
  let service: FamilyLoanPaymentService;
  let paymentsRepo: jest.Mocked<
    Pick<
      Repository<FamilyLoanPayment>,
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
  let familyLoanService: {
    findByIdForUser: jest.Mock;
    applyRepayment: jest.Mock;
    reverseRepayment: jest.Mock;
  };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };

  const basePayment = (
    overrides: Partial<FamilyLoanPayment> = {},
  ): FamilyLoanPayment =>
    ({
      id: 'flp-1',
      userId: 'user-1',
      familyLoanId: 'fl-1',
      paymentAccountId: 'acc-1',
      transactionId: 'tx-1',
      amountCents: 30000,
      paymentDate: new Date('2026-03-01T00:00:00.000Z'),
      paymentDirection: 'PAY_TO_LENDER',
      referenceNumber: null,
      notes: null,
      installmentNumber: null,
      attachmentKey: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as FamilyLoanPayment;

  beforeEach(async () => {
    const managerPaymentRepo = {
      create: jest.fn(
        (x: Partial<FamilyLoanPayment>) => x as FamilyLoanPayment,
      ),
      save: jest.fn(async (x: FamilyLoanPayment) => ({
        ...x,
        id: x.id ?? 'flp-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: FamilyLoanPayment) => x),
    };

    paymentsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as FamilyLoanPayment),
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
          currentBalanceCents: 500000,
        }) as Account,
      ),
    };

    transactionService = {
      create: jest.fn(async () => ({ id: 'tx-1' })),
      update: jest.fn(async () => ({ id: 'tx-1' })),
      delete: jest.fn(async () => true),
    };

    familyLoanService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'fl-1',
        loanType: 'BORROWED',
        status: 'ACTIVE',
        outstandingBalanceCents: 100000,
        personName: 'Brother',
        isActive: true,
      })),
      applyRepayment: jest.fn(async () => ({ id: 'fl-1' })),
      reverseRepayment: jest.fn(async () => ({ id: 'fl-1' })),
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
        FamilyLoanPaymentService,
        {
          provide: getRepositoryToken(FamilyLoanPayment),
          useValue: paymentsRepo,
        },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: FamilyLoanService, useValue: familyLoanService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(FamilyLoanPaymentService);
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

  it('creates BORROWED repayment with FAMILY_LOAN_PAYMENT', async () => {
    const result = await service.create('user-1', {
      family_loan_id: 'fl-1',
      payment_account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 30000,
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'FAMILY_LOAN_PAYMENT',
        account_id: 'acc-1',
        amount_cents: 30000,
      }),
      expect.anything(),
    );
    expect(familyLoanService.applyRepayment).toHaveBeenCalledWith(
      'user-1',
      'fl-1',
      30000,
      expect.anything(),
    );
    expect(managerPaymentRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDirection: 'PAY_TO_LENDER',
        transactionId: 'tx-1',
      }),
    );
    expect(result.paymentDirection).toBe('PAY_TO_LENDER');
  });

  it('creates LENT collection with FAMILY_LOAN_COLLECTION', async () => {
    familyLoanService.findByIdForUser.mockResolvedValue({
      id: 'fl-2',
      loanType: 'LENT',
      status: 'ACTIVE',
      outstandingBalanceCents: 200000,
      personName: 'Sister',
      isActive: true,
    });

    await service.create('user-1', {
      family_loan_id: 'fl-2',
      payment_account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 50000,
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'FAMILY_LOAN_COLLECTION',
      }),
      expect.anything(),
    );
    expect(managerPaymentRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentDirection: 'RECEIVE_FROM_BORROWER',
      }),
    );
    // Collections credit the account — no debit balance check path required.
    expect(accountsRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects payment above outstanding balance', async () => {
    familyLoanService.findByIdForUser.mockResolvedValue({
      id: 'fl-1',
      loanType: 'BORROWED',
      status: 'ACTIVE',
      outstandingBalanceCents: 10000,
      personName: 'Brother',
      isActive: true,
    });

    await expect(
      service.create('user-1', {
        family_loan_id: 'fl-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 30000,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects BORROWED repayment when account balance is insufficient', async () => {
    accountsRepo.findOne.mockResolvedValue({
      id: 'acc-1',
      currentBalanceCents: 1000,
    } as Account);

    await expect(
      service.create('user-1', {
        family_loan_id: 'fl-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 30000,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero amount', async () => {
    await expect(
      service.create('user-1', {
        family_loan_id: 'fl-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 0,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects payments on cancelled loans', async () => {
    familyLoanService.findByIdForUser.mockResolvedValue({
      id: 'fl-1',
      loanType: 'BORROWED',
      status: 'CANCELLED',
      outstandingBalanceCents: 100000,
      personName: 'Brother',
      isActive: false,
    });

    await expect(
      service.create('user-1', {
        family_loan_id: 'fl-1',
        payment_account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 30000,
        payment_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user payment', async () => {
    paymentsRepo.findOne.mockResolvedValue(
      basePayment({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'flp-1'),
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

    const result = await service.update('user-1', 'flp-1', {
      amount_cents: 20000,
    });

    expect(familyLoanService.reverseRepayment).toHaveBeenCalledWith(
      'user-1',
      'fl-1',
      30000,
      expect.anything(),
    );
    expect(familyLoanService.applyRepayment).toHaveBeenCalledWith(
      'user-1',
      'fl-1',
      20000,
      expect.anything(),
    );
    expect(transactionService.update).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.objectContaining({
        transaction_type: 'FAMILY_LOAN_PAYMENT',
        amount_cents: 20000,
      }),
      expect.anything(),
    );
    expect(result.amountCents).toBe(20000);
  });

  it('deletes payment and restores loan + ledger balances', async () => {
    paymentsRepo.findOne.mockResolvedValue(basePayment());
    managerPaymentRepo().findOne.mockResolvedValue(basePayment());

    await expect(service.delete('user-1', 'flp-1')).resolves.toBe(true);

    expect(managerPaymentRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
    expect(familyLoanService.reverseRepayment).toHaveBeenCalledWith(
      'user-1',
      'fl-1',
      30000,
      expect.anything(),
    );
  });
});
