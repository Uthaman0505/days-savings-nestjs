import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PawnCollateral } from './pawn-collateral.entity';
import { PawnLoan } from './pawn-loan.entity';
import { PawnLoanService } from './pawn-loan.service';
import { PawnPayment } from './pawn-payment.entity';
import { PawnRenewal } from './pawn-renewal.entity';
import { PawnTransaction } from './pawn-transaction.entity';

describe('PawnLoanService', () => {
  let service: PawnLoanService;
  let loansRepo: jest.Mocked<
    Pick<Repository<PawnLoan>, 'find' | 'findOne' | 'create' | 'save' | 'softRemove'>
  > & { manager: { transaction: jest.Mock } };
  let collateralsRepo: jest.Mocked<
    Pick<Repository<PawnCollateral>, 'find' | 'findOne' | 'create' | 'save'>
  >;
  let paymentsRepo: jest.Mocked<
    Pick<Repository<PawnPayment>, 'find' | 'create' | 'save'>
  >;
  let renewalsRepo: jest.Mocked<
    Pick<Repository<PawnRenewal>, 'find' | 'create' | 'save'>
  >;
  let transactionsRepo: jest.Mocked<
    Pick<Repository<PawnTransaction>, 'find' | 'create' | 'save'>
  >;

  const reposInsideTx: {
    loan: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
    collateral: { find: jest.Mock; save: jest.Mock; create: jest.Mock };
    payment: { save: jest.Mock; create: jest.Mock };
    renewal: { save: jest.Mock; create: jest.Mock };
    txn: { save: jest.Mock; create: jest.Mock };
  } = {
    loan: {
      findOne: jest.fn(),
      save: jest.fn(async (x) => ({ ...x, id: x.id ?? 'pl-1' })),
      create: jest.fn((x) => x),
    },
    collateral: {
      find: jest.fn(async () => []),
      save: jest.fn(async (x) => ({ ...x, id: x.id ?? 'pc-1' })),
      create: jest.fn((x) => x),
    },
    payment: {
      save: jest.fn(async (x) => ({
        ...x,
        id: 'pp-1',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      })),
      create: jest.fn((x) => x),
    },
    renewal: {
      save: jest.fn(async (x) => ({ ...x, id: 'pr-1' })),
      create: jest.fn((x) => x),
    },
    txn: {
      save: jest.fn(async (x) => ({ ...x, id: 'pt-1' })),
      create: jest.fn((x) => x),
    },
  };

  const baseLoan = (overrides: Partial<PawnLoan> = {}): PawnLoan =>
    ({
      id: 'pl-1',
      userId: 'user-1',
      pawnShopName: 'Kedai Pajak Emas',
      receiptNumber: 'PR-001',
      principalAmountCents: 500000,
      outstandingPrincipalCents: 500000,
      interestRate: '2.0000',
      interestType: 'FLAT',
      loanTermMonths: 6,
      gracePeriodDays: 14,
      loanStartDate: '2026-01-01',
      maturityDate: '2026-07-01',
      gracePeriodEndDate: '2026-07-15',
      status: 'ACTIVE',
      currency: 'MYR',
      remarks: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    }) as PawnLoan;

  beforeEach(async () => {
    loansRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as PawnLoan),
      save: jest.fn(async (x) => x as PawnLoan),
      softRemove: jest.fn(async (x) => x as PawnLoan),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: (entity: unknown) => {
              if (entity === PawnLoan) return reposInsideTx.loan;
              if (entity === PawnCollateral) return reposInsideTx.collateral;
              if (entity === PawnPayment) return reposInsideTx.payment;
              if (entity === PawnRenewal) return reposInsideTx.renewal;
              if (entity === PawnTransaction) return reposInsideTx.txn;
              return reposInsideTx.loan;
            },
          }),
        ),
      },
    };

    collateralsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as PawnCollateral),
      save: jest.fn(async (x) => x as PawnCollateral),
    };
    paymentsRepo = {
      find: jest.fn(),
      create: jest.fn((x) => x as PawnPayment),
      save: jest.fn(),
    };
    renewalsRepo = {
      find: jest.fn(),
      create: jest.fn((x) => x as PawnRenewal),
      save: jest.fn(),
    };
    transactionsRepo = {
      find: jest.fn(),
      create: jest.fn((x) => x as PawnTransaction),
      save: jest.fn(),
    };

    reposInsideTx.loan.findOne.mockReset();
    reposInsideTx.loan.save.mockClear();
    reposInsideTx.collateral.find.mockResolvedValue([]);
    reposInsideTx.txn.save.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PawnLoanService,
        { provide: getRepositoryToken(PawnLoan), useValue: loansRepo },
        {
          provide: getRepositoryToken(PawnCollateral),
          useValue: collateralsRepo,
        },
        { provide: getRepositoryToken(PawnPayment), useValue: paymentsRepo },
        { provide: getRepositoryToken(PawnRenewal), useValue: renewalsRepo },
        {
          provide: getRepositoryToken(PawnTransaction),
          useValue: transactionsRepo,
        },
      ],
    }).compile();

    service = module.get(PawnLoanService);
  });

  it('creates pawn loan with maturity and grace dates and collateral', async () => {
    loansRepo.findOne.mockResolvedValue(null);
    reposInsideTx.loan.save.mockImplementation(async (x) => ({
      ...x,
      id: 'pl-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    const result = await service.create('user-1', {
      pawn_shop_name: 'Kedai Pajak Emas',
      receipt_number: 'PR-001',
      principal_amount_cents: 500000,
      interest_rate: 2,
      loan_start_date: '2026-01-01',
      collaterals: [
        {
          item_type: 'GOLD_CHAIN',
          description: '22k gold chain',
          owner_name: 'Ali',
          estimated_value_cents: 800000,
        },
      ],
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.maturityDate).toBe('2026-07-01');
    expect(result.gracePeriodEndDate).toBe('2026-07-15');
    expect(reposInsideTx.collateral.save).toHaveBeenCalled();
    expect(reposInsideTx.txn.save).toHaveBeenCalled();
  });

  it('rejects zero principal', async () => {
    await expect(
      service.create('user-1', {
        pawn_shop_name: 'Shop',
        receipt_number: 'X1',
        principal_amount_cents: 0,
        loan_start_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects maturity before start date', async () => {
    await expect(
      service.create('user-1', {
        pawn_shop_name: 'Shop',
        receipt_number: 'X1',
        principal_amount_cents: 1000,
        loan_start_date: '2026-06-01',
        maturity_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records principal payment and reduces outstanding', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan());
    reposInsideTx.loan.findOne.mockResolvedValue(baseLoan());

    const payment = await service.recordPayment('user-1', {
      pawn_loan_id: 'pl-1',
      payment_type: 'PRINCIPAL_PAYMENT',
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
      principal_paid_cents: 100000,
      interest_paid_cents: 0,
      payment_method: 'CASH',
    });

    expect(payment.principalPaidCents).toBe(100000);
    expect(reposInsideTx.loan.save).toHaveBeenCalledWith(
      expect.objectContaining({ outstandingPrincipalCents: 400000 }),
    );
  });

  it('redeems loan and returns collateral', async () => {
    loansRepo.findOne
      .mockResolvedValueOnce(baseLoan())
      .mockResolvedValueOnce(
        baseLoan({ outstandingPrincipalCents: 0, status: 'REDEEMED' }),
      );
    reposInsideTx.loan.findOne.mockResolvedValue(baseLoan());
    reposInsideTx.collateral.find.mockResolvedValue([
      {
        id: 'pc-1',
        pawnLoanId: 'pl-1',
        currentStatus: 'HELD',
      } as PawnCollateral,
    ]);

    const result = await service.redeem('user-1', {
      pawn_loan_id: 'pl-1',
      payment_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(reposInsideTx.collateral.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentStatus: 'RETURNED' }),
    );
    expect(result.status).toBe('REDEEMED');
  });

  it('renews loan with new maturity cycle', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan());
    reposInsideTx.loan.findOne.mockResolvedValue(baseLoan());

    const result = await service.renew('user-1', {
      pawn_loan_id: 'pl-1',
      renewal_date: new Date('2026-07-01T00:00:00.000Z'),
      interest_paid_cents: 10000,
      principal_reduction_cents: 50000,
    });

    expect(reposInsideTx.renewal.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousMaturityDate: '2026-07-01',
        newMaturityDate: '2027-01-01',
        principalReductionCents: 50000,
      }),
    );
    expect(result.status).toBe('ACTIVE');
    expect(result.outstandingPrincipalCents).toBe(450000);
  });

  it('rejects renew on closed loan', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan({ status: 'CLOSED' }));

    await expect(
      service.renew('user-1', {
        pawn_loan_id: 'pl-1',
        renewal_date: new Date('2026-07-01T00:00:00.000Z'),
        interest_paid_cents: 1000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forfeits loan and marks collateral forfeited', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan());
    reposInsideTx.loan.findOne.mockResolvedValue(baseLoan());
    reposInsideTx.collateral.find.mockResolvedValue([
      {
        id: 'pc-1',
        pawnLoanId: 'pl-1',
        currentStatus: 'HELD',
      } as PawnCollateral,
    ]);

    const result = await service.forfeit('user-1', {
      pawn_loan_id: 'pl-1',
      remarks: 'No payment after grace',
    });

    expect(reposInsideTx.collateral.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentStatus: 'FORFEITED' }),
    );
    expect(result.status).toBe('CLOSED');
  });

  it('rejects forfeit of redeemed loan', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan({ status: 'REDEEMED' }));

    await expect(
      service.forfeit('user-1', { pawn_loan_id: 'pl-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft deletes a pawn loan', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan());

    await expect(service.delete('user-1', { id: 'pl-1' })).resolves.toBe(true);
    expect(loansRepo.softRemove).toHaveBeenCalled();
  });

  it('forbids access to another user loan', async () => {
    loansRepo.findOne.mockResolvedValue(baseLoan({ userId: 'other' }));

    await expect(service.findPawnLoan('user-1', 'pl-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns not found for missing loan', async () => {
    loansRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findPawnLoan('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
