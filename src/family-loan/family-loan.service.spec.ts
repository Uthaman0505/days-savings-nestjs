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
import { TransactionService } from '../transaction/transaction.service';
import { FamilyLoan } from './family-loan.entity';
import { FamilyLoanService } from './family-loan.service';

describe('FamilyLoanService', () => {
  let service: FamilyLoanService;
  let familyLoansRepo: jest.Mocked<
    Pick<
      Repository<FamilyLoan>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  > & {
    manager: { transaction: jest.Mock };
  };
  let accountsRepo: jest.Mocked<Pick<Repository<Account>, 'findOne'>>;
  let transactionService: {
    create: jest.Mock;
    delete: jest.Mock;
  };
  let accountService: {
    findByIdForUser: jest.Mock;
  };
  let categoryService: {
    assertAssignable: jest.Mock;
  };

  const baseLoan = (overrides: Partial<FamilyLoan> = {}): FamilyLoan =>
    ({
      id: 'fl-1',
      userId: 'user-1',
      loanType: 'BORROWED',
      personName: 'Brother',
      relationship: 'Sibling',
      contactNumber: null,
      accountId: 'acc-1',
      transactionId: 'tx-1',
      principalAmountCents: 100000,
      outstandingBalanceCents: 100000,
      interestRate: '0.0000',
      loanStartDate: '2026-03-01',
      expectedEndDate: null,
      currency: 'MYR',
      notes: null,
      agreementDocumentKey: null,
      guarantorName: null,
      status: 'ACTIVE',
      isActive: true,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      ...overrides,
    }) as FamilyLoan;

  beforeEach(async () => {
    const managerLoanRepo = {
      create: jest.fn((x: Partial<FamilyLoan>) => x as FamilyLoan),
      save: jest.fn(async (x: FamilyLoan) => ({
        ...x,
        id: x.id ?? 'fl-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
      findOne: jest.fn(),
      remove: jest.fn(async (x: FamilyLoan) => x),
    };

    familyLoansRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as FamilyLoan),
      save: jest.fn(async (x) => x as FamilyLoan),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: () => managerLoanRepo,
          }),
        ),
      },
    };

    (
      familyLoansRepo as unknown as {
        _managerLoanRepo: typeof managerLoanRepo;
      }
    )._managerLoanRepo = managerLoanRepo;

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
      create: jest.fn(async (_userId, input) => ({
        id: 'tx-1',
        userId: 'user-1',
        accountId: input.account_id,
        categoryId: input.category_id,
        transactionType: input.transaction_type,
        amountCents: input.amount_cents,
        transactionDate: input.transaction_date,
        description: input.description,
        notes: input.notes ?? null,
        status: 'COMPLETED',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      })),
      delete: jest.fn(async () => true),
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
        FamilyLoanService,
        { provide: getRepositoryToken(FamilyLoan), useValue: familyLoansRepo },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
      ],
    }).compile();

    service = module.get(FamilyLoanService);
  });

  const managerLoanRepo = () =>
    (
      familyLoansRepo as unknown as {
        _managerLoanRepo: {
          create: jest.Mock;
          save: jest.Mock;
          findOne: jest.Mock;
          remove: jest.Mock;
        };
      }
    )._managerLoanRepo;

  it('creates a BORROWED loan with LOAN_RECEIVED ledger entry', async () => {
    const result = await service.create('user-1', {
      loan_type: 'BORROWED',
      person_name: '  Brother  ',
      relationship: 'Sibling',
      account_id: 'acc-1',
      category_id: 'cat-1',
      principal_amount_cents: 100000,
      loan_start_date: '2026-03-01',
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'LOAN_RECEIVED',
        amount_cents: 100000,
        account_id: 'acc-1',
        status: 'COMPLETED',
      }),
      expect.anything(),
    );
    expect(managerLoanRepo().create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        loanType: 'BORROWED',
        personName: 'Brother',
        transactionId: 'tx-1',
        principalAmountCents: 100000,
        outstandingBalanceCents: 100000,
        status: 'ACTIVE',
        isActive: true,
      }),
    );
    expect(result.transactionId).toBe('tx-1');
    expect(result.loanType).toBe('BORROWED');
  });

  it('creates a LENT loan with LOAN_GIVEN and checks balance', async () => {
    await service.create('user-1', {
      loan_type: 'LENT',
      person_name: 'Sister',
      relationship: 'Sibling',
      account_id: 'acc-1',
      category_id: 'cat-1',
      principal_amount_cents: 200000,
      loan_start_date: '2026-03-01',
    });

    expect(accountsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
    });
    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'LOAN_GIVEN',
        amount_cents: 200000,
      }),
      expect.anything(),
    );
  });

  it('rejects LENT when account balance is insufficient', async () => {
    accountsRepo.findOne.mockResolvedValue({
      id: 'acc-1',
      currentBalanceCents: 1000,
    } as Account);

    await expect(
      service.create('user-1', {
        loan_type: 'LENT',
        person_name: 'Friend',
        relationship: 'Friend',
        account_id: 'acc-1',
        category_id: 'cat-1',
        principal_amount_cents: 200000,
        loan_start_date: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionService.create).not.toHaveBeenCalled();
  });

  it('rejects zero principal', async () => {
    await expect(
      service.create('user-1', {
        loan_type: 'BORROWED',
        person_name: 'Mother',
        relationship: 'Parent',
        account_id: 'acc-1',
        category_id: 'cat-1',
        principal_amount_cents: 0,
        loan_start_date: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects outstanding balance above principal', async () => {
    await expect(
      service.create('user-1', {
        loan_type: 'BORROWED',
        person_name: 'Mother',
        relationship: 'Parent',
        account_id: 'acc-1',
        category_id: 'cat-1',
        principal_amount_cents: 100000,
        outstanding_balance_cents: 120000,
        loan_start_date: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative interest rate', async () => {
    await expect(
      service.create('user-1', {
        loan_type: 'BORROWED',
        person_name: 'Mother',
        relationship: 'Parent',
        account_id: 'acc-1',
        category_id: 'cat-1',
        principal_amount_cents: 100000,
        interest_rate: -1,
        loan_start_date: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects blank person name', async () => {
    await expect(
      service.create('user-1', {
        loan_type: 'BORROWED',
        person_name: '   ',
        relationship: 'Parent',
        account_id: 'acc-1',
        category_id: 'cat-1',
        principal_amount_cents: 100000,
        loan_start_date: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives a family loan', async () => {
    familyLoansRepo.findOne.mockResolvedValue(baseLoan());

    const result = await service.archive('user-1', 'fl-1');

    expect(familyLoansRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fl-1', isActive: false }),
    );
    expect(result.isActive).toBe(false);
  });

  it('deletes loan then reverses ledger in one transaction', async () => {
    familyLoansRepo.findOne.mockResolvedValue(baseLoan());
    managerLoanRepo().findOne.mockResolvedValue(baseLoan());

    await expect(service.delete('user-1', 'fl-1')).resolves.toBe(true);

    expect(managerLoanRepo().remove).toHaveBeenCalled();
    expect(transactionService.delete).toHaveBeenCalledWith(
      'user-1',
      'tx-1',
      expect.anything(),
    );
  });

  it('forbids access to another user loan', async () => {
    familyLoansRepo.findOne.mockResolvedValue(
      baseLoan({ userId: 'other-user' }),
    );

    await expect(
      service.findByIdForUser('user-1', 'fl-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for missing loan', async () => {
    familyLoansRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies repayment and completes when balance reaches zero', async () => {
    managerLoanRepo().findOne.mockResolvedValue(
      baseLoan({ outstandingBalanceCents: 50000 }),
    );

    const result = await service.applyRepayment('user-1', 'fl-1', 50000);

    expect(managerLoanRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({
        outstandingBalanceCents: 0,
        status: 'COMPLETED',
        isActive: false,
      }),
    );
    expect(result.outstandingBalanceCents).toBe(0);
    expect(result.status).toBe('COMPLETED');
    expect(result.isActive).toBe(false);
  });

  it('rejects repayment above outstanding balance', async () => {
    managerLoanRepo().findOne.mockResolvedValue(
      baseLoan({ outstandingBalanceCents: 10000 }),
    );

    await expect(
      service.applyRepayment('user-1', 'fl-1', 20000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
