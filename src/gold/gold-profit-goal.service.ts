import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { evaluateGoldProfitGoal } from './gold-profit-goal';
import { GoldProfitGoal } from './gold-profit-goal.entity';
import { GoldService } from './gold.service';
import type { SetGoldProfitGoalInput } from './dto/set-gold-profit-goal.input';
import type { GoldProfitGoalStatusModel } from './models/gold-profit-goal.model';

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
    if (!Number.isInteger(targetProfitCents) || targetProfitCents < 1) {
      throw new BadRequestException(
        'target_profit_cents must be greater than 0.',
      );
    }

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

  private async findActiveGoal(userId: string): Promise<GoldProfitGoal | null> {
    return this.goalsRepo.findOne({
      where: { userId, isActive: true, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
  }

  private async evaluateForUser(
    userId: string,
    goal: GoldProfitGoal,
  ): Promise<GoldProfitGoalStatusModel> {
    const source = await this.goldService.getGoldAnalyticsSource(userId);
    const evaluated = evaluateGoldProfitGoal({
      goal: {
        id: goal.id,
        targetProfitCents: goal.targetProfitCents,
        status: goal.status,
        isActive: goal.isActive,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
        achievedAt: goal.achievedAt,
      },
      purchases: source.purchases,
      latestPrice: source.latestPrice,
    });
    return {
      goal: {
        id: evaluated.goal.id,
        targetProfitCents: evaluated.goal.targetProfitCents,
        status: evaluated.goal.status,
        isActive: evaluated.goal.isActive,
        createdAt: evaluated.goal.createdAt,
        updatedAt: evaluated.goal.updatedAt,
        achievedAt: evaluated.goal.achievedAt,
      },
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
}
