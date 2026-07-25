import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { SavingsService } from '../savings/savings.service';
import { TransactionService } from '../transaction/transaction.service';
import { ContributeGoalInput } from './dto/contribute-goal.input';
import {
  CreateGoalInput,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  GOAL_TYPES,
} from './dto/create-goal.input';
import {
  GoalContributionFilterInput,
  GoalFilterInput,
} from './dto/goal-filter.input';
import { UpdateGoalInput } from './dto/update-goal.input';
import { WithdrawGoalInput } from './dto/withdraw-goal.input';
import {
  GoalContribution,
  GoalContributionSource,
} from './goal-contribution.entity';
import { Goal, GoalPriority, GoalStatus, GoalType } from './goals.entity';
import { GoalContributionModel } from './models/goal-contribution.model';
import { GoalModel } from './models/goal.model';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal)
    private readonly goalsRepo: Repository<Goal>,
    @InjectRepository(GoalContribution)
    private readonly contributionsRepo: Repository<GoalContribution>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
    private readonly savingsService: SavingsService,
  ) {}

  async findMyGoals(
    userId: string,
    filter?: GoalFilterInput,
  ): Promise<GoalModel[]> {
    return this.queryGoals(userId, filter ?? {});
  }

  async findActiveGoals(userId: string): Promise<GoalModel[]> {
    const rows = await this.goalsRepo.find({
      where: { userId, isActive: true, status: 'ACTIVE' },
      order: { targetDate: 'ASC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toGoalModel(row));
  }

  async findCompletedGoals(userId: string): Promise<GoalModel[]> {
    const rows = await this.goalsRepo.find({
      where: { userId, status: 'COMPLETED' },
      order: { targetDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toGoalModel(row));
  }

  async findByType(userId: string, type: string): Promise<GoalModel[]> {
    const goalType = this.requireGoalType(type);
    const rows = await this.goalsRepo.find({
      where: { userId, goalType },
      order: { targetDate: 'ASC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toGoalModel(row));
  }

  async findByIdForUser(userId: string, goalId: string): Promise<GoalModel> {
    const row = await this.requireOwnedGoal(userId, goalId);
    return this.toGoalModel(row);
  }

  async findContributions(
    userId: string,
    filter?: GoalContributionFilterInput,
  ): Promise<GoalContributionModel[]> {
    const where: FindOptionsWhere<GoalContribution> = { userId };
    if (filter?.goal_id) {
      await this.requireOwnedGoal(userId, filter.goal_id);
      where.goalId = filter.goal_id;
    }

    const sortNewest = (filter?.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const rows = await this.contributionsRepo.find({
      where,
      order: {
        movementDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toContributionModel(row));
  }

  async create(userId: string, input: CreateGoalInput): Promise<GoalModel> {
    const name = this.normalizeName(input.name, 'Goal name');
    const goalType = this.requireGoalType(input.goal_type);
    const priority = this.requirePriority(input.priority ?? 'MEDIUM');
    const targetAmountCents = this.requirePositiveCents(
      input.target_amount_cents,
      'Target amount',
    );
    const currentAmountCents = this.requireNonNegativeCents(
      input.current_amount_cents ?? 0,
      'Current amount',
    );
    if (currentAmountCents > targetAmountCents) {
      throw new BadRequestException(
        'Current amount cannot exceed target amount.',
      );
    }

    const startDate = this.requireDateString(input.start_date, 'Start date');
    const targetDate = this.requireDateString(input.target_date, 'Target date');
    this.assertDateOnOrAfter(
      targetDate,
      startDate,
      'Target date must not be before start date.',
    );

    await this.assertUniqueName(userId, name);

    const status = this.resolveStatus(
      'ACTIVE',
      currentAmountCents,
      targetAmountCents,
    );

    const entity = this.goalsRepo.create({
      userId,
      name,
      description: input.description?.trim() || null,
      goalType,
      targetAmountCents,
      currentAmountCents,
      currency: (input.currency ?? 'MYR').toUpperCase(),
      priority,
      startDate,
      targetDate,
      status,
      isActive: true,
      monthlyContributionCents: null,
      isShared: false,
      reminderEnabled: false,
    });

    const saved = await this.goalsRepo.save(entity);
    return this.toGoalModel(saved);
  }

  async update(
    userId: string,
    goalId: string,
    input: UpdateGoalInput,
  ): Promise<GoalModel> {
    const goal = await this.requireOwnedGoal(userId, goalId);

    const nextName =
      input.name !== undefined
        ? this.normalizeName(input.name, 'Goal name')
        : goal.name;
    const nextTarget =
      input.target_amount_cents !== undefined
        ? this.requirePositiveCents(input.target_amount_cents, 'Target amount')
        : goal.targetAmountCents;
    const nextCurrent =
      input.current_amount_cents !== undefined
        ? this.requireNonNegativeCents(
            input.current_amount_cents,
            'Current amount',
          )
        : goal.currentAmountCents;
    if (nextCurrent > nextTarget) {
      throw new BadRequestException(
        'Current amount cannot exceed target amount.',
      );
    }

    const nextStart =
      input.start_date !== undefined
        ? this.requireDateString(input.start_date, 'Start date')
        : goal.startDate;
    const nextTargetDate =
      input.target_date !== undefined
        ? this.requireDateString(input.target_date, 'Target date')
        : goal.targetDate;
    this.assertDateOnOrAfter(
      nextTargetDate,
      nextStart,
      'Target date must not be before start date.',
    );

    if (input.name !== undefined) {
      await this.assertUniqueName(userId, nextName, goalId);
      goal.name = nextName;
    }
    if (input.description !== undefined) {
      goal.description =
        input.description === null ? null : input.description.trim() || null;
    }
    if (input.goal_type !== undefined) {
      goal.goalType = this.requireGoalType(input.goal_type);
    }
    if (input.target_amount_cents !== undefined) {
      goal.targetAmountCents = nextTarget;
    }
    if (input.current_amount_cents !== undefined) {
      goal.currentAmountCents = nextCurrent;
    }
    if (input.currency !== undefined) {
      goal.currency = input.currency.toUpperCase();
    }
    if (input.priority !== undefined) {
      goal.priority = this.requirePriority(input.priority);
    }
    if (input.start_date !== undefined) goal.startDate = nextStart;
    if (input.target_date !== undefined) goal.targetDate = nextTargetDate;

    if (input.status !== undefined) {
      goal.status = this.requireStatus(input.status);
      if (goal.status === 'CANCELLED') {
        goal.isActive = false;
      }
    } else if (
      input.current_amount_cents !== undefined ||
      input.target_amount_cents !== undefined
    ) {
      goal.status = this.resolveStatus(
        goal.status,
        goal.currentAmountCents,
        goal.targetAmountCents,
      );
    }

    const saved = await this.goalsRepo.save(goal);
    return this.toGoalModel(saved);
  }

  async archive(userId: string, goalId: string): Promise<GoalModel> {
    const goal = await this.requireOwnedGoal(userId, goalId);
    goal.isActive = false;
    if (goal.status !== 'COMPLETED') {
      goal.status = 'CANCELLED';
    }
    const saved = await this.goalsRepo.save(goal);
    return this.toGoalModel(saved);
  }

  async delete(userId: string, goalId: string): Promise<boolean> {
    const goal = await this.requireOwnedGoal(userId, goalId);
    if (goal.currentAmountCents > 0) {
      throw new BadRequestException(
        'Withdraw the goal balance before deleting this goal.',
      );
    }

    const contributionCount = await this.contributionsRepo.count({
      where: { goalId },
    });
    if (contributionCount > 0) {
      throw new BadRequestException(
        'Remove or reverse goal contributions before deleting this goal.',
      );
    }

    await this.goalsRepo.remove(goal);
    return true;
  }

  async contribute(
    userId: string,
    input: ContributeGoalInput,
  ): Promise<GoalContributionModel> {
    const amountCents = this.requirePositiveCents(input.amount_cents, 'Amount');
    const movementDate = this.requireMovementDate(input.contribution_date);
    const sourceType = this.requireSourceType(input.source_type);
    const goal = await this.requireOwnedGoal(userId, input.goal_id);

    if (!goal.isActive || goal.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cancelled or inactive goals cannot receive contributions.',
      );
    }

    await this.categoryService.assertAssignable(input.category_id, userId);

    let accountId: string;
    let savingsId: string | null = null;
    const affectsAccountBalance = sourceType === 'ACCOUNT';

    if (sourceType === 'ACCOUNT') {
      if (!input.account_id) {
        throw new BadRequestException(
          'account_id is required when source_type is ACCOUNT.',
        );
      }
      await this.assertWritableAccount(userId, input.account_id);
      await this.assertSufficientAccountBalance(input.account_id, amountCents);
      accountId = input.account_id;
    } else {
      if (!input.savings_id) {
        throw new BadRequestException(
          'savings_id is required when source_type is SAVINGS.',
        );
      }
      const savings = await this.savingsService.findByIdForUser(
        userId,
        input.savings_id,
      );
      if (amountCents > savings.currentBalanceCents) {
        throw new BadRequestException('Insufficient savings balance.');
      }
      await this.assertWritableAccount(userId, savings.accountId);
      accountId = savings.accountId;
      savingsId = input.savings_id;
    }

    const saved = await this.goalsRepo.manager.transaction(async (manager) => {
      const goalsRepo = manager.getRepository(Goal);
      const contributionsRepo = manager.getRepository(GoalContribution);

      const goalRow = await goalsRepo.findOne({
        where: { id: input.goal_id },
      });
      if (!goalRow || goalRow.userId !== userId) {
        throw new NotFoundException('Goal not found.');
      }

      if (sourceType === 'SAVINGS' && savingsId) {
        await this.savingsService.applyBalanceAdjustment(
          userId,
          savingsId,
          -amountCents,
          manager,
        );
      }

      const ledger = await this.transactionService.create(
        userId,
        {
          account_id: accountId,
          category_id: input.category_id,
          transaction_type: 'GOAL_CONTRIBUTION',
          amount_cents: amountCents,
          transaction_date: movementDate,
          description: `Contribution to ${goalRow.name}`,
          notes: input.notes,
          status: 'COMPLETED',
        },
        manager,
        { applyBalance: affectsAccountBalance },
      );

      goalRow.currentAmountCents += amountCents;
      goalRow.status = this.resolveStatus(
        goalRow.status,
        goalRow.currentAmountCents,
        goalRow.targetAmountCents,
      );
      await goalsRepo.save(goalRow);

      const contribution = contributionsRepo.create({
        userId,
        goalId: goalRow.id,
        savingsId,
        accountId,
        transactionId: ledger.id,
        amountCents,
        movementDate,
        movementType: 'CONTRIBUTION',
        sourceType,
        affectsAccountBalance,
        notes: input.notes?.trim() || null,
      });

      return contributionsRepo.save(contribution);
    });

    return this.toContributionModel(saved);
  }

  async withdraw(
    userId: string,
    input: WithdrawGoalInput,
  ): Promise<GoalContributionModel> {
    const amountCents = this.requirePositiveCents(input.amount_cents, 'Amount');
    const movementDate = this.requireMovementDate(input.withdrawal_date);
    const destinationType = this.requireSourceType(input.destination_type);
    const goal = await this.requireOwnedGoal(userId, input.goal_id);

    if (!goal.isActive || goal.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cancelled or inactive goals cannot be withdrawn from.',
      );
    }
    if (amountCents > goal.currentAmountCents) {
      throw new BadRequestException('Insufficient goal balance.');
    }

    await this.categoryService.assertAssignable(input.category_id, userId);

    let accountId: string;
    let savingsId: string | null = null;
    const affectsAccountBalance = destinationType === 'ACCOUNT';

    if (destinationType === 'ACCOUNT') {
      if (!input.account_id) {
        throw new BadRequestException(
          'account_id is required when destination_type is ACCOUNT.',
        );
      }
      await this.assertWritableAccount(userId, input.account_id);
      accountId = input.account_id;
    } else {
      if (!input.savings_id) {
        throw new BadRequestException(
          'savings_id is required when destination_type is SAVINGS.',
        );
      }
      const savings = await this.savingsService.findByIdForUser(
        userId,
        input.savings_id,
      );
      await this.assertWritableAccount(userId, savings.accountId);
      accountId = savings.accountId;
      savingsId = input.savings_id;
    }

    const saved = await this.goalsRepo.manager.transaction(async (manager) => {
      const goalsRepo = manager.getRepository(Goal);
      const contributionsRepo = manager.getRepository(GoalContribution);

      const goalRow = await goalsRepo.findOne({
        where: { id: input.goal_id },
      });
      if (!goalRow || goalRow.userId !== userId) {
        throw new NotFoundException('Goal not found.');
      }
      if (amountCents > goalRow.currentAmountCents) {
        throw new BadRequestException('Insufficient goal balance.');
      }

      const ledger = await this.transactionService.create(
        userId,
        {
          account_id: accountId,
          category_id: input.category_id,
          transaction_type: 'GOAL_WITHDRAW',
          amount_cents: amountCents,
          transaction_date: movementDate,
          description: `Withdrawal from ${goalRow.name}`,
          notes: input.notes,
          status: 'COMPLETED',
        },
        manager,
        { applyBalance: affectsAccountBalance },
      );

      if (destinationType === 'SAVINGS' && savingsId) {
        await this.savingsService.applyBalanceAdjustment(
          userId,
          savingsId,
          amountCents,
          manager,
        );
      }

      goalRow.currentAmountCents -= amountCents;
      goalRow.status = this.resolveStatus(
        goalRow.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
        goalRow.currentAmountCents,
        goalRow.targetAmountCents,
      );
      await goalsRepo.save(goalRow);

      const contribution = contributionsRepo.create({
        userId,
        goalId: goalRow.id,
        savingsId,
        accountId,
        transactionId: ledger.id,
        amountCents,
        movementDate,
        movementType: 'WITHDRAWAL',
        sourceType: destinationType,
        affectsAccountBalance,
        notes: input.notes?.trim() || null,
      });

      return contributionsRepo.save(contribution);
    });

    return this.toContributionModel(saved);
  }

  private async queryGoals(
    userId: string,
    filter: GoalFilterInput,
  ): Promise<GoalModel[]> {
    const where: FindOptionsWhere<Goal> = { userId };

    if (filter.goal_type) {
      where.goalType = this.requireGoalType(filter.goal_type);
    }
    if (filter.priority) {
      where.priority = this.requirePriority(filter.priority);
    }
    if (filter.status) {
      where.status = this.requireStatus(filter.status);
    }

    if (filter.target_date_from && filter.target_date_to) {
      where.targetDate = Between(
        this.requireDateString(filter.target_date_from, 'Target date from'),
        this.requireDateString(filter.target_date_to, 'Target date to'),
      );
    } else if (filter.target_date_from) {
      where.targetDate = MoreThanOrEqual(
        this.requireDateString(filter.target_date_from, 'Target date from'),
      );
    } else if (filter.target_date_to) {
      where.targetDate = LessThanOrEqual(
        this.requireDateString(filter.target_date_to, 'Target date to'),
      );
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.goalsRepo.find({
      where,
      order: {
        targetDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toGoalModel(row));
  }

  private async requireOwnedGoal(
    userId: string,
    goalId: string,
  ): Promise<Goal> {
    const goal = await this.goalsRepo.findOne({ where: { id: goalId } });
    if (!goal) {
      throw new NotFoundException('Goal not found.');
    }
    if (goal.userId !== userId) {
      throw new ForbiddenException('You do not own this goal.');
    }
    return goal;
  }

  private async assertWritableAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(
      userId,
      accountId,
    );
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for goal transfers.',
      );
    }
  }

  private async assertSufficientAccountBalance(
    accountId: string,
    amountCents: number,
  ): Promise<void> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    if (account.currentBalanceCents < amountCents) {
      throw new BadRequestException('Insufficient account balance.');
    }
  }

  private async assertUniqueName(
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.goalsRepo.findOne({
      where: excludeId
        ? { userId, name, id: Not(excludeId) }
        : { userId, name },
    });
    if (existing) {
      throw new BadRequestException('A goal with this name already exists.');
    }
  }

  private resolveStatus(
    currentStatus: GoalStatus,
    currentAmountCents: number,
    targetAmountCents: number,
  ): GoalStatus {
    if (currentStatus === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (currentAmountCents >= targetAmountCents) {
      return 'COMPLETED';
    }
    return 'ACTIVE';
  }

  private assertDateOnOrAfter(
    later: string,
    earlier: string,
    message: string,
  ): void {
    if (later < earlier) {
      throw new BadRequestException(message);
    }
  }

  private requireGoalType(type: string): GoalType {
    if (!GOAL_TYPES.includes(type as (typeof GOAL_TYPES)[number])) {
      throw new BadRequestException('Invalid goal type.');
    }
    return type as GoalType;
  }

  private requirePriority(priority: string): GoalPriority {
    if (
      !GOAL_PRIORITIES.includes(priority as (typeof GOAL_PRIORITIES)[number])
    ) {
      throw new BadRequestException('Invalid goal priority.');
    }
    return priority as GoalPriority;
  }

  private requireStatus(status: string): GoalStatus {
    if (!GOAL_STATUSES.includes(status as (typeof GOAL_STATUSES)[number])) {
      throw new BadRequestException('Invalid goal status.');
    }
    return status as GoalStatus;
  }

  private requireSourceType(type: string): GoalContributionSource {
    if (type !== 'ACCOUNT' && type !== 'SAVINGS') {
      throw new BadRequestException('Invalid contribution source type.');
    }
    return type;
  }

  private requirePositiveCents(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private requireNonNegativeCents(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${label} cannot be negative.`);
    }
    return value;
  }

  private requireDateString(value: string, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed.slice(0, 10);
  }

  private requireMovementDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Movement date is required.');
    }
    return value;
  }

  private normalizeName(name: string, label: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed;
  }

  private toDateField(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  private toGoalModel(row: Goal): GoalModel {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      goalType: row.goalType,
      targetAmountCents: row.targetAmountCents,
      currentAmountCents: row.currentAmountCents,
      currency: row.currency,
      priority: row.priority,
      startDate: this.toDateField(row.startDate),
      targetDate: this.toDateField(row.targetDate),
      status: row.status,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as GoalModel;
  }

  private toContributionModel(row: GoalContribution): GoalContributionModel {
    return {
      id: row.id,
      userId: row.userId,
      goalId: row.goalId,
      savingsId: row.savingsId,
      accountId: row.accountId,
      transactionId: row.transactionId,
      amountCents: row.amountCents,
      movementDate: row.movementDate,
      movementType: row.movementType,
      sourceType: row.sourceType,
      affectsAccountBalance: row.affectsAccountBalance,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as GoalContributionModel;
  }
}
