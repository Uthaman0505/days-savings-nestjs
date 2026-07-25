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
import { SavingsService } from '../savings/savings.service';
import { TransactionService } from '../transaction/transaction.service';
import { GoalContribution } from './goal-contribution.entity';
import { Goal } from './goals.entity';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let service: GoalsService;
  let goalsRepo: jest.Mocked<
    Pick<Repository<Goal>, 'find' | 'findOne' | 'create' | 'save' | 'remove'>
  > & {
    manager: { transaction: jest.Mock };
  };
  let contributionsRepo: jest.Mocked<
    Pick<Repository<GoalContribution>, 'find' | 'count' | 'create' | 'save'>
  >;
  let accountsRepo: jest.Mocked<Pick<Repository<Account>, 'findOne'>>;
  let transactionService: { create: jest.Mock };
  let accountService: { findByIdForUser: jest.Mock };
  let categoryService: { assertAssignable: jest.Mock };
  let savingsService: {
    findByIdForUser: jest.Mock;
    applyBalanceAdjustment: jest.Mock;
  };

  const baseGoal = (overrides: Partial<Goal> = {}): Goal =>
    ({
      id: 'goal-1',
      userId: 'user-1',
      name: 'Europe Vacation',
      description: null,
      goalType: 'TRAVEL',
      targetAmountCents: 1000000,
      currentAmountCents: 100000,
      currency: 'MYR',
      priority: 'HIGH',
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
      status: 'ACTIVE',
      isActive: true,
      monthlyContributionCents: null,
      isShared: false,
      reminderEnabled: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Goal;

  beforeEach(async () => {
    const managerGoalRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x: Goal) => x),
    };
    const managerContributionRepo = {
      create: jest.fn((x: Partial<GoalContribution>) => x as GoalContribution),
      save: jest.fn(async (x: GoalContribution) => ({
        ...x,
        id: x.id ?? 'gc-1',
        createdAt: x.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: x.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      })),
    };

    goalsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Goal),
      save: jest.fn(async (x) => {
        const entity = x as Goal;
        return {
          ...entity,
          id: entity.id ?? 'goal-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as Goal;
      }),
      remove: jest.fn(async (x) => x),
      manager: {
        transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
          fn({
            getRepository: (entity: unknown) => {
              if (entity === Goal) return managerGoalRepo;
              if (entity === GoalContribution) return managerContributionRepo;
              return managerGoalRepo;
            },
          }),
        ),
      },
    };

    (
      goalsRepo as unknown as {
        _managerGoalRepo: typeof managerGoalRepo;
        _managerContributionRepo: typeof managerContributionRepo;
      }
    )._managerGoalRepo = managerGoalRepo;
    (
      goalsRepo as unknown as {
        _managerContributionRepo: typeof managerContributionRepo;
      }
    )._managerContributionRepo = managerContributionRepo;

    contributionsRepo = {
      find: jest.fn(),
      count: jest.fn(async () => 0),
      create: jest.fn((x) => x as GoalContribution),
      save: jest.fn(),
    };

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

    savingsService = {
      findByIdForUser: jest.fn(async () => ({
        id: 'sav-1',
        accountId: 'acc-1',
        currentBalanceCents: 200000,
        isActive: true,
        status: 'ACTIVE',
      })),
      applyBalanceAdjustment: jest.fn(async () => ({ id: 'sav-1' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: getRepositoryToken(Goal), useValue: goalsRepo },
        {
          provide: getRepositoryToken(GoalContribution),
          useValue: contributionsRepo,
        },
        { provide: getRepositoryToken(Account), useValue: accountsRepo },
        { provide: TransactionService, useValue: transactionService },
        { provide: AccountService, useValue: accountService },
        { provide: CategoryService, useValue: categoryService },
        { provide: SavingsService, useValue: savingsService },
      ],
    }).compile();

    service = module.get(GoalsService);
  });

  const managerGoalRepo = () =>
    (
      goalsRepo as unknown as {
        _managerGoalRepo: { findOne: jest.Mock; save: jest.Mock };
      }
    )._managerGoalRepo;

  it('creates a goal without money movement', async () => {
    goalsRepo.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      name: '  Europe Vacation  ',
      goal_type: 'TRAVEL',
      target_amount_cents: 1000000,
      start_date: '2026-01-01',
      target_date: '2026-12-31',
      priority: 'HIGH',
    });

    expect(transactionService.create).not.toHaveBeenCalled();
    expect(goalsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Europe Vacation',
        goalType: 'TRAVEL',
        currentAmountCents: 0,
        status: 'ACTIVE',
      }),
    );
    expect(result.name).toBe('Europe Vacation');
  });

  it('rejects target date before start date', async () => {
    await expect(
      service.create('user-1', {
        name: 'New Car',
        goal_type: 'CAR',
        target_amount_cents: 5000000,
        start_date: '2026-06-01',
        target_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('contributes from account with GOAL_CONTRIBUTION and account balance change', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal());
    managerGoalRepo().findOne.mockResolvedValue(baseGoal());

    const result = await service.contribute('user-1', {
      goal_id: 'goal-1',
      source_type: 'ACCOUNT',
      account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 50000,
      contribution_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'GOAL_CONTRIBUTION',
        amount_cents: 50000,
        account_id: 'acc-1',
      }),
      expect.anything(),
      { applyBalance: true },
    );
    expect(savingsService.applyBalanceAdjustment).not.toHaveBeenCalled();
    expect(managerGoalRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({ currentAmountCents: 150000 }),
    );
    expect(result.movementType).toBe('CONTRIBUTION');
    expect(result.affectsAccountBalance).toBe(true);
  });

  it('contributes from savings without debiting account again', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal());
    managerGoalRepo().findOne.mockResolvedValue(baseGoal());

    const result = await service.contribute('user-1', {
      goal_id: 'goal-1',
      source_type: 'SAVINGS',
      savings_id: 'sav-1',
      category_id: 'cat-1',
      amount_cents: 50000,
      contribution_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(savingsService.applyBalanceAdjustment).toHaveBeenCalledWith(
      'user-1',
      'sav-1',
      -50000,
      expect.anything(),
    );
    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ transaction_type: 'GOAL_CONTRIBUTION' }),
      expect.anything(),
      { applyBalance: false },
    );
    expect(result.sourceType).toBe('SAVINGS');
    expect(result.affectsAccountBalance).toBe(false);
  });

  it('marks goal COMPLETED when contribution reaches target', async () => {
    goalsRepo.findOne.mockResolvedValue(
      baseGoal({ currentAmountCents: 950000, targetAmountCents: 1000000 }),
    );
    managerGoalRepo().findOne.mockResolvedValue(
      baseGoal({ currentAmountCents: 950000, targetAmountCents: 1000000 }),
    );

    await service.contribute('user-1', {
      goal_id: 'goal-1',
      source_type: 'ACCOUNT',
      account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 50000,
      contribution_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(managerGoalRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({
        currentAmountCents: 1000000,
        status: 'COMPLETED',
      }),
    );
  });

  it('withdraws to account with GOAL_WITHDRAW', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal());
    managerGoalRepo().findOne.mockResolvedValue(baseGoal());

    const result = await service.withdraw('user-1', {
      goal_id: 'goal-1',
      destination_type: 'ACCOUNT',
      account_id: 'acc-1',
      category_id: 'cat-1',
      amount_cents: 40000,
      withdrawal_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        transaction_type: 'GOAL_WITHDRAW',
        amount_cents: 40000,
      }),
      expect.anything(),
      { applyBalance: true },
    );
    expect(managerGoalRepo().save).toHaveBeenCalledWith(
      expect.objectContaining({ currentAmountCents: 60000 }),
    );
    expect(result.movementType).toBe('WITHDRAWAL');
  });

  it('withdraws to savings and credits the pot', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal());
    managerGoalRepo().findOne.mockResolvedValue(baseGoal());

    await service.withdraw('user-1', {
      goal_id: 'goal-1',
      destination_type: 'SAVINGS',
      savings_id: 'sav-1',
      category_id: 'cat-1',
      amount_cents: 25000,
      withdrawal_date: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(transactionService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ transaction_type: 'GOAL_WITHDRAW' }),
      expect.anything(),
      { applyBalance: false },
    );
    expect(savingsService.applyBalanceAdjustment).toHaveBeenCalledWith(
      'user-1',
      'sav-1',
      25000,
      expect.anything(),
    );
  });

  it('rejects withdrawal above goal balance', async () => {
    goalsRepo.findOne.mockResolvedValue(
      baseGoal({ currentAmountCents: 10000 }),
    );

    await expect(
      service.withdraw('user-1', {
        goal_id: 'goal-1',
        destination_type: 'ACCOUNT',
        account_id: 'acc-1',
        category_id: 'cat-1',
        amount_cents: 50000,
        withdrawal_date: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives a goal as CANCELLED', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal());

    const result = await service.archive('user-1', 'goal-1');

    expect(goalsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        status: 'CANCELLED',
      }),
    );
    expect(result.isActive).toBe(false);
  });

  it('rejects delete when goal still has balance', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal({ currentAmountCents: 5000 }));

    await expect(service.delete('user-1', 'goal-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('forbids access to another user goal', async () => {
    goalsRepo.findOne.mockResolvedValue(baseGoal({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'goal-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found for missing goal', async () => {
    goalsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
