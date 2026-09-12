import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { analyzeGoldBudgetAllocation } from './gold-budget-allocation';
import {
  computeGoldFutureScenario,
  computeGoldFutureScenarioComparison,
  isPlannedDeploymentPercent,
  MAX_FUTURE_SCENARIO_PRICES,
} from './gold-future-scenario';
import {
  computeGoldGoalDecision,
  type GoldGoalDecision,
} from './gold-goal-decision';
import { GoldPlanningSettings } from './gold-planning-settings.entity';
import { GoldProfitGoal } from './gold-profit-goal.entity';
import type { GoldProfitGoalRecord } from './gold-profit-goal';
import { GoldService } from './gold.service';
import type { GoldPurchaseObservation } from './gold-portfolio-analytics';
import type { SetGoldMonthlyBudgetInput } from './dto/set-gold-monthly-budget.input';
import type {
  GoldFutureScenarioComparisonInput,
  GoldFutureScenarioInput,
} from './dto/gold-future-scenario.input';
import type {
  GoldBudgetAllocationAnalysisModel,
  GoldGoalDecisionModel,
  GoldPlanningSettingsModel,
} from './models/gold-planning.model';
import type {
  GoldFutureScenarioComparisonModel,
  GoldFutureScenarioModel,
} from './models/gold-future-scenario.model';

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
    const ctx = await this.loadPlanningContext(userId);
    return analyzeGoldBudgetAllocation(ctx.decision);
  }

  async getGoldFutureScenario(
    userId: string,
    input: GoldFutureScenarioInput,
  ): Promise<GoldFutureScenarioModel> {
    this.assertFuturePgBuy(input.future_pg_buy_per_gram_cents);
    const planned = this.parsePlannedPercent(input.planned_deployment_percent);
    const requested = this.parseRequestedProfit(input.requested_profit_cents);
    const ctx = await this.loadPlanningContext(userId);
    return computeGoldFutureScenario({
      futurePgBuyPerGramCents: input.future_pg_buy_per_gram_cents,
      plannedDeploymentPercent: planned,
      requestedProfitCents: requested,
      goal: ctx.goal,
      purchases: ctx.purchases,
      decision: ctx.decision,
    });
  }

  async getGoldFutureScenarioComparison(
    userId: string,
    input: GoldFutureScenarioComparisonInput,
  ): Promise<GoldFutureScenarioComparisonModel> {
    const prices = this.parseComparisonPrices(input.future_price_cents);
    const planned = this.parsePlannedPercent(input.planned_deployment_percent);
    const requested = this.parseRequestedProfit(input.requested_profit_cents);
    const ctx = await this.loadPlanningContext(userId);
    return computeGoldFutureScenarioComparison({
      futurePriceCents: prices,
      plannedDeploymentPercent: planned,
      requestedProfitCents: requested,
      goal: ctx.goal,
      purchases: ctx.purchases,
      decision: ctx.decision,
    });
  }

  private async loadGoldGoalDecision(
    userId: string,
  ): Promise<GoldGoalDecision> {
    const ctx = await this.loadPlanningContext(userId);
    return ctx.decision;
  }

  private async loadPlanningContext(userId: string): Promise<{
    decision: GoldGoalDecision;
    purchases: GoldPurchaseObservation[];
    goal: GoldProfitGoalRecord | null;
  }> {
    const [settings, source, goal] = await Promise.all([
      this.settingsRepo.findOne({ where: { userId } }),
      this.goldService.getGoldAnalyticsSource(userId),
      this.goalsRepo.findOne({
        where: { userId, isActive: true, status: 'ACTIVE' },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const goalRecord: GoldProfitGoalRecord | null = goal
      ? {
          id: goal.id,
          targetProfitCents: goal.targetProfitCents,
          status: goal.status,
          isActive: goal.isActive,
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
          achievedAt: goal.achievedAt,
        }
      : null;

    return {
      decision: computeGoldGoalDecision({
        monthlyBudgetCents: settings?.monthlyBudgetCents ?? null,
        goal: goalRecord,
        purchases: source.purchases,
        prices: source.prices,
        latestPrice: source.latestPrice,
        todayPriceDate: source.todayPriceDate,
      }),
      purchases: source.purchases,
      goal: goalRecord,
    };
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

  private assertFuturePgBuy(cents: number): void {
    if (!Number.isInteger(cents) || cents < 1) {
      throw new BadRequestException(
        'future_pg_buy_per_gram_cents must be greater than 0.',
      );
    }
  }

  private parsePlannedPercent(value: number | null | undefined): number | null {
    if (value == null) {
      return null;
    }
    if (!isPlannedDeploymentPercent(value)) {
      throw new BadRequestException(
        'planned_deployment_percent must be 25, 50, 75, or 100.',
      );
    }
    return value;
  }

  private parseRequestedProfit(
    value: number | null | undefined,
  ): number | null {
    if (value == null) {
      return null;
    }
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException(
        'requested_profit_cents must be greater than 0.',
      );
    }
    return value;
  }

  private parseComparisonPrices(prices: number[] | null | undefined): number[] {
    if (!Array.isArray(prices)) {
      throw new BadRequestException('future_price_cents must be an array.');
    }
    if (prices.length > MAX_FUTURE_SCENARIO_PRICES) {
      throw new BadRequestException(
        `Compare at most ${MAX_FUTURE_SCENARIO_PRICES} hypothetical PG BUY prices.`,
      );
    }
    for (const cents of prices) {
      if (!Number.isInteger(cents) || cents < 1) {
        throw new BadRequestException(
          'Each future_price_cents value must be an integer greater than 0.',
        );
      }
    }
    return prices;
  }
}
