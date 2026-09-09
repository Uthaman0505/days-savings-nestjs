import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { evaluateGoldProfitGoal } from './gold-profit-goal';
import { GoldProfitGoal } from './gold-profit-goal.entity';
import { GoldService } from './gold.service';
import type { SetGoldProfitGoalInput } from './dto/set-gold-profit-goal.input';
import type { GoldProfitTakingPreviewInput } from './dto/gold-profit-taking-preview.input';
import type { GoldNextProfitGoalPreviewInput } from './dto/gold-next-profit-goal-preview.input';
import type { CreateNextGoldProfitGoalInput } from './dto/create-next-gold-profit-goal.input';
import type {
  GoldProfitGoalModel,
  GoldProfitGoalStatusModel,
} from './models/gold-profit-goal.model';
import type { GoldProfitTakingPreviewModel } from './models/gold-profit-taking-preview.model';
import type {
  GoldNextProfitGoalPreviewModel,
  GoldProfitGoalCompletionModel,
  GoldProfitGoalHistoryItemModel,
} from './models/gold-next-profit-goal.model';
import {
  GOLD_PROFIT_TAKING_MODES,
  evaluateGoldProfitTakingPreview,
} from './gold-profit-taking';
import {
  evaluateNextProfitGoalPreview,
  goalHistoryDurationDays,
} from './gold-next-profit-goal';

@Injectable()
export class GoldProfitGoalService {
  constructor(
    @InjectRepository(GoldProfitGoal)
    private readonly goalsRepo: Repository<GoldProfitGoal>,
    private readonly goldService: GoldService,
  ) {}

  async getGoldProfitGoal(
    userId: string,
  ): Promise<GoldProfitGoalStatusModel | null> {
    const goal = await this.findActiveGoal(userId);
    if (!goal) {
      return null;
    }
    return this.evaluateForUser(userId, goal);
  }

  async setGoldProfitGoal(
    userId: string,
    input: SetGoldProfitGoalInput,
  ): Promise<GoldProfitGoalStatusModel> {
    const targetProfitCents = input.target_profit_cents;
    this.assertPositiveTarget(targetProfitCents);

    let goal = await this.findActiveGoal(userId);
    if (goal) {
      goal.targetProfitCents = targetProfitCents;
      goal = await this.goalsRepo.save(goal);
    } else {
      goal = await this.goalsRepo.save(
        this.goalsRepo.create({
          userId,
          targetProfitCents,
          status: 'ACTIVE',
          isActive: true,
          achievedAt: null,
        }),
      );
    }
    return this.evaluateForUser(userId, goal);
  }

  async cancelGoldProfitGoal(userId: string): Promise<boolean> {
    const goal = await this.findActiveGoal(userId);
    if (!goal) {
      throw new NotFoundException('No active Gold profit goal.');
    }
    goal.status = 'CANCELLED';
    goal.isActive = false;
    await this.goalsRepo.save(goal);
    return true;
  }

  async getGoldProfitTakingPreview(
    userId: string,
    input: GoldProfitTakingPreviewInput,
  ): Promise<GoldProfitTakingPreviewModel> {
    const mode = input.mode;
    if (!GOLD_PROFIT_TAKING_MODES.includes(mode)) {
      throw new BadRequestException('mode must be TARGET or PARTIAL.');
    }
    const [goal, source] = await Promise.all([
      this.findActiveGoal(userId),
      this.goldService.getGoldAnalyticsSource(userId),
    ]);
    const preview = evaluateGoldProfitTakingPreview({
      goal: goal ? this.toRecord(goal) : null,
      purchases: source.purchases,
      latestPrice: source.latestPrice,
      mode,
      requestedProfitCents: input.requested_profit_cents,
    });
    return preview;
  }

  async completeGoldProfitGoal(
    userId: string,
  ): Promise<GoldProfitGoalCompletionModel> {
    return this.goalsRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(GoldProfitGoal);
      const active = await repo.findOne({
        where: { userId, isActive: true, status: 'ACTIVE' },
        lock: { mode: 'pessimistic_write' },
        order: { createdAt: 'DESC' },
      });
      if (!active) {
        const achieved = await this.findLatestAchieved(repo, userId);
        if (achieved) {
          return {
            goal: this.toGoalModel(achieved),
            alreadyCompleted: true,
          };
        }
        throw new NotFoundException('No active Gold profit goal.');
      }

      const source = await this.goldService.getGoldAnalyticsSource(userId);
      const evaluation = evaluateGoldProfitGoal({
        goal: this.toRecord(active),
        purchases: source.purchases,
        latestPrice: source.latestPrice,
      });
      if (!evaluation.isTargetReached) {
        throw new BadRequestException('TARGET_NOT_REACHED');
      }

      active.status = 'ACHIEVED';
      active.isActive = false;
      active.achievedAt = new Date();
      const saved = await repo.save(active);
      return {
        goal: this.toGoalModel(saved),
        alreadyCompleted: false,
      };
    });
  }

  async getGoldProfitGoalHistory(
    userId: string,
  ): Promise<GoldProfitGoalHistoryItemModel[]> {
    const rows = await this.goalsRepo.find({
      where: [
        { userId, status: 'ACHIEVED' },
        { userId, status: 'CANCELLED' },
      ],
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      targetProfitCents: row.targetProfitCents,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      achievedAt: row.achievedAt,
      durationDays: goalHistoryDurationDays(
        row.createdAt,
        row.achievedAt,
        row.updatedAt,
      ),
    }));
  }

  async getGoldNextProfitGoalPreview(
    userId: string,
    input: GoldNextProfitGoalPreviewInput,
  ): Promise<GoldNextProfitGoalPreviewModel> {
    const previous = await this.goalsRepo.findOne({
      where: { id: input.previous_goal_id, userId },
    });
    if (!previous) {
      throw new NotFoundException('Previous Gold profit goal not found.');
    }
    const source = await this.goldService.getGoldAnalyticsSource(userId);
    try {
      return evaluateNextProfitGoalPreview({
        previousGoalId: previous.id,
        previousTargetCents: previous.targetProfitCents,
        purchases: source.purchases,
        latestPrice: source.latestPrice,
        rule: input.rule,
        fixedIncreaseCents: input.fixed_increase_cents,
        percentage: input.percentage,
      });
    } catch (error) {
      throw this.toPreviewBadRequest(error);
    }
  }

  async createNextGoldProfitGoal(
    userId: string,
    input: CreateNextGoldProfitGoalInput,
  ): Promise<GoldProfitGoalStatusModel> {
    const targetProfitCents = input.target_profit_cents;
    this.assertPositiveTarget(targetProfitCents);

    try {
      const created = await this.goalsRepo.manager.transaction(
        async (manager) => {
          const repo = manager.getRepository(GoldProfitGoal);
          const previous = await repo.findOne({
            where: { id: input.previous_goal_id, userId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!previous || previous.status !== 'ACHIEVED') {
            throw new BadRequestException('Previous goal must be ACHIEVED.');
          }
          const active = await repo.findOne({
            where: { userId, isActive: true, status: 'ACTIVE' },
            lock: { mode: 'pessimistic_write' },
          });
          if (active) {
            throw new BadRequestException(
              'An active profit goal already exists.',
            );
          }
          return repo.save(
            repo.create({
              userId,
              targetProfitCents,
              status: 'ACTIVE',
              isActive: true,
              achievedAt: null,
            }),
          );
        },
      );
      return this.evaluateForUser(userId, created);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException('An active profit goal already exists.');
      }
      throw error;
    }
  }

  private async findActiveGoal(userId: string): Promise<GoldProfitGoal | null> {
    return this.goalsRepo.findOne({
      where: { userId, isActive: true, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
  }

  private async findLatestAchieved(
    repo: Repository<GoldProfitGoal>,
    userId: string,
  ): Promise<GoldProfitGoal | null> {
    return repo.findOne({
      where: { userId, status: 'ACHIEVED' },
      order: { achievedAt: 'DESC', updatedAt: 'DESC' },
    });
  }

  private async evaluateForUser(
    userId: string,
    goal: GoldProfitGoal,
  ): Promise<GoldProfitGoalStatusModel> {
    const source = await this.goldService.getGoldAnalyticsSource(userId);
    const evaluated = evaluateGoldProfitGoal({
      goal: this.toRecord(goal),
      purchases: source.purchases,
      latestPrice: source.latestPrice,
    });
    return {
      goal: this.toGoalModel(goal),
      protectedCapitalCents: evaluated.protectedCapitalCents,
      currentValueCents: evaluated.currentValueCents,
      availableProfitCents: evaluated.availableProfitCents,
      remainingProfitCents: evaluated.remainingProfitCents,
      requiredPortfolioValueCents: evaluated.requiredPortfolioValueCents,
      requiredPgBuyPerGramCents: evaluated.requiredPgBuyPerGramCents,
      currentPgBuyPerGramCents: evaluated.currentPgBuyPerGramCents,
      averageCostPerGramCents: evaluated.averageCostPerGramCents,
      distanceToRequiredPgBuyCents: evaluated.distanceToRequiredPgBuyCents,
      distanceToRequiredPgBuyPercent: evaluated.distanceToRequiredPgBuyPercent,
      progressPercent: evaluated.progressPercent,
      excessProfitCents: evaluated.excessProfitCents,
      isTargetReached: evaluated.isTargetReached,
      hasCurrentPrice: evaluated.hasCurrentPrice,
      hasHoldings: evaluated.hasHoldings,
      totalGrams: evaluated.totalGrams,
    };
  }

  private toRecord(goal: GoldProfitGoal) {
    return {
      id: goal.id,
      targetProfitCents: goal.targetProfitCents,
      status: goal.status,
      isActive: goal.isActive,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      achievedAt: goal.achievedAt,
    };
  }

  private toGoalModel(goal: GoldProfitGoal): GoldProfitGoalModel {
    return {
      id: goal.id,
      targetProfitCents: goal.targetProfitCents,
      status: goal.status,
      isActive: goal.isActive,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      achievedAt: goal.achievedAt,
    };
  }

  private assertPositiveTarget(targetProfitCents: number): void {
    if (!Number.isInteger(targetProfitCents) || targetProfitCents < 1) {
      throw new BadRequestException(
        'target_profit_cents must be greater than 0.',
      );
    }
  }

  private toPreviewBadRequest(error: unknown): BadRequestException {
    const code = error instanceof Error ? error.message : '';
    switch (code) {
      case 'INVALID_FIXED_INCREASE':
        return new BadRequestException(
          'fixed_increase_cents must be greater than 0.',
        );
      case 'INVALID_PERCENTAGE':
        return new BadRequestException(
          'percentage must be greater than 0 and at most 100.',
        );
      case 'INVALID_PREVIOUS_TARGET':
      case 'INVALID_NEXT_TARGET':
        return new BadRequestException(
          'target_profit_cents must be greater than 0.',
        );
      case 'INVALID_NEXT_TARGET_RULE':
        return new BadRequestException(
          'rule must be SAME, FIXED_RM_INCREASE, or PERCENT_INCREASE.',
        );
      default:
        return new BadRequestException('Unable to preview next profit target.');
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) {
      return false;
    }
    const driver = err.driverError as { code?: string };
    return driver?.code === '23505';
  }
}
