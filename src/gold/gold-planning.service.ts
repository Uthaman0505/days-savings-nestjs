import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { analyzeGoldBudgetAllocation } from './gold-budget-allocation';
import {
  computeGoldGoalDecision,
  type GoldGoalDecision,
} from './gold-goal-decision';
import { GoldPlanningSettings } from './gold-planning-settings.entity';
import { GoldProfitGoal } from './gold-profit-goal.entity';
import { GoldService } from './gold.service';
import type { SetGoldMonthlyBudgetInput } from './dto/set-gold-monthly-budget.input';
import type {
  GoldBudgetAllocationAnalysisModel,
  GoldGoalDecisionModel,
  GoldPlanningSettingsModel,
} from './models/gold-planning.model';

@Injectable()
export class GoldPlanningService {
  constructor(
    @InjectRepository(GoldPlanningSettings)
    private readonly settingsRepo: Repository<GoldPlanningSettings>,
    @InjectRepository(GoldProfitGoal)
    private readonly goalsRepo: Repository<GoldProfitGoal>,
    private readonly goldService: GoldService,
  ) {}

  async getGoldPlanningSettings(
    userId: string,
  ): Promise<GoldPlanningSettingsModel | null> {
    const row = await this.settingsRepo.findOne({ where: { userId } });
    return row ? this.toSettingsModel(row) : null;
  }

  async setGoldMonthlyBudget(
    userId: string,
    input: SetGoldMonthlyBudgetInput,
  ): Promise<GoldPlanningSettingsModel> {
    const monthlyBudgetCents = input.monthly_budget_cents;
    this.assertPositiveBudget(monthlyBudgetCents);

    let row = await this.settingsRepo.findOne({ where: { userId } });
    if (row) {
      row.monthlyBudgetCents = monthlyBudgetCents;
      row = await this.settingsRepo.save(row);
    } else {
      row = await this.settingsRepo.save(
        this.settingsRepo.create({
          userId,
          monthlyBudgetCents,
        }),
      );
    }
    return this.toSettingsModel(row);
  }

  async getGoldGoalDecision(userId: string): Promise<GoldGoalDecisionModel> {
    return this.loadGoldGoalDecision(userId);
  }

  async getGoldBudgetAllocationAnalysis(
    userId: string,
  ): Promise<GoldBudgetAllocationAnalysisModel> {
    const decision = await this.loadGoldGoalDecision(userId);
    return analyzeGoldBudgetAllocation(decision);
  }

  private async loadGoldGoalDecision(
    userId: string,
  ): Promise<GoldGoalDecision> {
    const [settings, source, goal] = await Promise.all([
      this.settingsRepo.findOne({ where: { userId } }),
      this.goldService.getGoldAnalyticsSource(userId),
      this.goalsRepo.findOne({
        where: { userId, isActive: true, status: 'ACTIVE' },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return computeGoldGoalDecision({
      monthlyBudgetCents: settings?.monthlyBudgetCents ?? null,
      goal: goal
        ? {
            id: goal.id,
            targetProfitCents: goal.targetProfitCents,
            status: goal.status,
            isActive: goal.isActive,
            createdAt: goal.createdAt,
            updatedAt: goal.updatedAt,
            achievedAt: goal.achievedAt,
          }
        : null,
      purchases: source.purchases,
      prices: source.prices,
      latestPrice: source.latestPrice,
      todayPriceDate: source.todayPriceDate,
    });
  }

  private toSettingsModel(
    row: GoldPlanningSettings,
  ): GoldPlanningSettingsModel {
    return {
      id: row.id,
      monthlyBudgetCents: row.monthlyBudgetCents,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private assertPositiveBudget(monthlyBudgetCents: number): void {
    if (!Number.isInteger(monthlyBudgetCents) || monthlyBudgetCents < 1) {
      throw new BadRequestException(
        'monthly_budget_cents must be greater than 0.',
      );
    }
  }
}
