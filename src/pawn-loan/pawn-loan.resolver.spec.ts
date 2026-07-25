import { Test, TestingModule } from '@nestjs/testing';
import type { JwtUser } from '../auth/jwt.strategy';
import { PawnLoanResolver } from './pawn-loan.resolver';
import { PawnLoanService } from './pawn-loan.service';

describe('PawnLoanResolver', () => {
  let resolver: PawnLoanResolver;
  let service: {
    findPawnLoans: jest.Mock;
    findPawnLoan: jest.Mock;
    create: jest.Mock;
    renew: jest.Mock;
    redeem: jest.Mock;
    forfeit: jest.Mock;
    delete: jest.Mock;
  };

  const user: JwtUser = {
    id: 'user-1',
    email: 'u@example.com',
    displayName: 'User',
    avatarUrl: null,
    roles: ['USER'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    service = {
      findPawnLoans: jest.fn(async () => []),
      findPawnLoan: jest.fn(async () => ({ id: 'pl-1' })),
      create: jest.fn(async () => ({ id: 'pl-1' })),
      renew: jest.fn(async () => ({ id: 'pl-1', status: 'ACTIVE' })),
      redeem: jest.fn(async () => ({ id: 'pl-1', status: 'REDEEMED' })),
      forfeit: jest.fn(async () => ({ id: 'pl-1', status: 'CLOSED' })),
      delete: jest.fn(async () => true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PawnLoanResolver,
        { provide: PawnLoanService, useValue: service },
      ],
    }).compile();

    resolver = module.get(PawnLoanResolver);
  });

  it('delegates pawnLoans query to service', async () => {
    await resolver.pawnLoans(user, undefined);
    expect(service.findPawnLoans).toHaveBeenCalledWith('user-1', undefined);
  });

  it('delegates createPawnLoan mutation to service', async () => {
    const input = {
      pawn_shop_name: 'Shop',
      receipt_number: 'R1',
      principal_amount_cents: 1000,
      loan_start_date: '2026-01-01',
    };
    await resolver.createPawnLoan(user, input);
    expect(service.create).toHaveBeenCalledWith('user-1', input);
  });

  it('delegates renew / redeem / forfeit / delete', async () => {
    await resolver.renewPawnLoan(user, {
      pawn_loan_id: 'pl-1',
      renewal_date: new Date(),
      interest_paid_cents: 100,
    });
    await resolver.redeemPawnLoan(user, {
      pawn_loan_id: 'pl-1',
      payment_date: new Date(),
    });
    await resolver.forfeitPawnLoan(user, { pawn_loan_id: 'pl-1' });
    await resolver.deletePawnLoan(user, { id: 'pl-1' });

    expect(service.renew).toHaveBeenCalled();
    expect(service.redeem).toHaveBeenCalled();
    expect(service.forfeit).toHaveBeenCalled();
    expect(service.delete).toHaveBeenCalledWith('user-1', { id: 'pl-1' });
  });
});
