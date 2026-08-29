import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { GoalModel } from '../goals/models/goal.model';
import {
  AllocateExtraDebtPaymentInput,
  ComputeProjectionInput,
  CreateManualDebtPriorityInput,
  CreateSalaryPlanInput,
  ReorderDebtPrioritiesInput,
  SyncDebtPrioritiesInput,
  UpdateSalaryAllocationsInput,
  UpsertProjectionSettingsInput,
} from './dto/mission-control.input';
import { MissionControlService } from './mission-control.service';
import {
  DebtPriorityModel,
  FinancialMissionModel,
  FinancialProjectionModel,
  MissionDashboardModel,
  MissionTimelineEventModel,
  MonthlySnapshotModel,
  ProjectionSettingsModel,
  SalaryPlanModel,
  UpcomingBillModel,
} from './models/mission-control.model';

@Resolver()
export class MissionControlResolver {
  constructor(private readonly missionControlService: MissionControlService) {}

  @Query(() => MissionDashboardModel, { name: 'missionDashboard' })
  @UseGuards(JwtAuthGuard)
  missionDashboard(
    @CurrentUser() user: JwtUser,
  ): Promise<MissionDashboardModel> {
    return this.missionControlService.getMissionDashboard(user.id);
  }

  @Query(() => SalaryPlanModel, { name: 'salaryPlan', nullable: true })
  @UseGuards(JwtAuthGuard)
  salaryPlan(
    @CurrentUser() user: JwtUser,
    @Args('monthKey', { type: () => String, nullable: true }) monthKey?: string,
  ): Promise<SalaryPlanModel | null> {
    return this.missionControlService.getSalaryPlan(user.id, monthKey);
  }

  @Mutation(() => SalaryPlanModel, { name: 'createSalaryPlan' })
  @UseGuards(JwtAuthGuard)
  createSalaryPlan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateSalaryPlanInput,
  ): Promise<SalaryPlanModel> {
    return this.missionControlService.createSalaryPlan(user.id, input);
  }

  @Mutation(() => SalaryPlanModel, { name: 'updateSalaryAllocations' })
  @UseGuards(JwtAuthGuard)
  updateSalaryAllocations(
    @CurrentUser() user: JwtUser,
    @Args('input') input: UpdateSalaryAllocationsInput,
  ): Promise<SalaryPlanModel> {
    return this.missionControlService.updateSalaryAllocations(user.id, input);
  }

  @Query(() => [DebtPriorityModel], { name: 'debtPriorities' })
  @UseGuards(JwtAuthGuard)
  debtPriorities(@CurrentUser() user: JwtUser): Promise<DebtPriorityModel[]> {
    return this.missionControlService.listDebtPriorities(user.id);
  }

  @Mutation(() => [DebtPriorityModel], { name: 'syncDebtPriorities' })
  @UseGuards(JwtAuthGuard)
  syncDebtPriorities(
    @CurrentUser() user: JwtUser,
    @Args('input') input: SyncDebtPrioritiesInput,
  ): Promise<DebtPriorityModel[]> {
    return this.missionControlService.syncDebtPriorities(user.id, input);
  }

  @Mutation(() => [DebtPriorityModel], { name: 'reorderDebtPriorities' })
  @UseGuards(JwtAuthGuard)
  reorderDebtPriorities(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ReorderDebtPrioritiesInput,
  ): Promise<DebtPriorityModel[]> {
    return this.missionControlService.reorderDebtPriorities(user.id, input);
  }

  @Mutation(() => DebtPriorityModel, { name: 'allocateExtraDebtPayment' })
  @UseGuards(JwtAuthGuard)
  allocateExtraDebtPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: AllocateExtraDebtPaymentInput,
  ): Promise<DebtPriorityModel> {
    return this.missionControlService.allocateExtraPayment(user.id, input);
  }

  @Mutation(() => DebtPriorityModel, { name: 'createManualDebtPriority' })
  @UseGuards(JwtAuthGuard)
  createManualDebtPriority(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateManualDebtPriorityInput,
  ): Promise<DebtPriorityModel> {
    return this.missionControlService.createManualDebtPriority(user.id, input);
  }

  @Query(() => [FinancialMissionModel], { name: 'financialMissions' })
  @UseGuards(JwtAuthGuard)
  financialMissions(
    @CurrentUser() user: JwtUser,
  ): Promise<FinancialMissionModel[]> {
    return this.missionControlService.listMissions(user.id, true);
  }

  @Mutation(() => Number, { name: 'archiveCompletedMissions' })
  @UseGuards(JwtAuthGuard)
  archiveCompletedMissions(@CurrentUser() user: JwtUser): Promise<number> {
    return this.missionControlService.archiveCompletedMissions(user.id);
  }

  @Query(() => [UpcomingBillModel], { name: 'upcomingBills' })
  @UseGuards(JwtAuthGuard)
  upcomingBills(@CurrentUser() user: JwtUser): Promise<UpcomingBillModel[]> {
    return this.missionControlService.getUpcomingBills(user.id);
  }

  @Query(() => ProjectionSettingsModel, { name: 'projectionSettings' })
  @UseGuards(JwtAuthGuard)
  async projectionSettings(
    @CurrentUser() user: JwtUser,
  ): Promise<ProjectionSettingsModel> {
    const row = await this.missionControlService.getOrCreateProjectionSettings(
      user.id,
    );
    return {
      id: row.id,
      userId: row.userId,
      monthlyExtraPaymentCents: row.monthlyExtraPaymentCents,
      priorityMethod: row.priorityMethod,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Mutation(() => ProjectionSettingsModel, { name: 'upsertProjectionSettings' })
  @UseGuards(JwtAuthGuard)
  upsertProjectionSettings(
    @CurrentUser() user: JwtUser,
    @Args('input') input: UpsertProjectionSettingsInput,
  ): Promise<ProjectionSettingsModel> {
    return this.missionControlService.upsertProjectionSettings(user.id, input);
  }

  @Query(() => FinancialProjectionModel, { name: 'financialProjection' })
  @UseGuards(JwtAuthGuard)
  financialProjection(
    @CurrentUser() user: JwtUser,
    @Args('input', { type: () => ComputeProjectionInput, nullable: true })
    input?: ComputeProjectionInput,
  ): Promise<FinancialProjectionModel> {
    return this.missionControlService.computeProjection(user.id, input ?? {});
  }

  @Query(() => [MissionTimelineEventModel], { name: 'missionTimeline' })
  @UseGuards(JwtAuthGuard)
  missionTimeline(
    @CurrentUser() user: JwtUser,
  ): Promise<MissionTimelineEventModel[]> {
    return this.missionControlService.getTimeline(user.id);
  }

  @Query(() => [MonthlySnapshotModel], { name: 'monthlySnapshots' })
  @UseGuards(JwtAuthGuard)
  monthlySnapshots(
    @CurrentUser() user: JwtUser,
  ): Promise<MonthlySnapshotModel[]> {
    return this.missionControlService.listSnapshots(user.id);
  }

  @Query(() => [GoalModel], { name: 'missionGoals' })
  @UseGuards(JwtAuthGuard)
  missionGoals(@CurrentUser() user: JwtUser): Promise<GoalModel[]> {
    return this.missionControlService.listGoals(user.id);
  }
}
