import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ArchiveGoalInput } from './dto/archive-goal.input';
import { ContributeGoalInput } from './dto/contribute-goal.input';
import { CreateGoalInput } from './dto/create-goal.input';
import { DeleteGoalInput } from './dto/delete-goal.input';
import {
  GoalContributionFilterInput,
  GoalFilterInput,
} from './dto/goal-filter.input';
import { UpdateGoalInput } from './dto/update-goal.input';
import { WithdrawGoalInput } from './dto/withdraw-goal.input';
import { GoalsService } from './goals.service';
import { GoalContributionModel } from './models/goal-contribution.model';
import { GoalModel } from './models/goal.model';

@Resolver()
export class GoalsResolver {
  constructor(private readonly goalsService: GoalsService) {}

  @Query(() => [GoalModel], { name: 'myGoals' })
  @UseGuards(JwtAuthGuard)
  myGoals(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => GoalFilterInput, nullable: true })
    filter?: GoalFilterInput,
  ): Promise<GoalModel[]> {
    return this.goalsService.findMyGoals(user.id, filter);
  }

  @Query(() => GoalModel, { name: 'goalById' })
  @UseGuards(JwtAuthGuard)
  goalById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GoalModel> {
    return this.goalsService.findByIdForUser(user.id, id);
  }

  @Query(() => [GoalModel], { name: 'activeGoals' })
  @UseGuards(JwtAuthGuard)
  activeGoals(@CurrentUser() user: JwtUser): Promise<GoalModel[]> {
    return this.goalsService.findActiveGoals(user.id);
  }

  @Query(() => [GoalModel], { name: 'completedGoals' })
  @UseGuards(JwtAuthGuard)
  completedGoals(@CurrentUser() user: JwtUser): Promise<GoalModel[]> {
    return this.goalsService.findCompletedGoals(user.id);
  }

  @Query(() => [GoalModel], { name: 'goalsByType' })
  @UseGuards(JwtAuthGuard)
  goalsByType(
    @CurrentUser() user: JwtUser,
    @Args('type', { type: () => String }) type: string,
  ): Promise<GoalModel[]> {
    return this.goalsService.findByType(user.id, type);
  }

  @Query(() => [GoalContributionModel], { name: 'goalContributions' })
  @UseGuards(JwtAuthGuard)
  goalContributions(
    @CurrentUser() user: JwtUser,
    @Args('filter', {
      type: () => GoalContributionFilterInput,
      nullable: true,
    })
    filter?: GoalContributionFilterInput,
  ): Promise<GoalContributionModel[]> {
    return this.goalsService.findContributions(user.id, filter);
  }

  @Mutation(() => GoalModel, { name: 'createGoal' })
  @UseGuards(JwtAuthGuard)
  createGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateGoalInput,
  ): Promise<GoalModel> {
    return this.goalsService.create(user.id, input);
  }

  @Mutation(() => GoalModel, { name: 'updateGoal' })
  @UseGuards(JwtAuthGuard)
  updateGoal(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateGoalInput,
  ): Promise<GoalModel> {
    return this.goalsService.update(user.id, id, input);
  }

  @Mutation(() => GoalModel, { name: 'archiveGoal' })
  @UseGuards(JwtAuthGuard)
  archiveGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveGoalInput,
  ): Promise<GoalModel> {
    return this.goalsService.archive(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteGoal' })
  @UseGuards(JwtAuthGuard)
  deleteGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteGoalInput,
  ): Promise<boolean> {
    return this.goalsService.delete(user.id, input.id);
  }

  @Mutation(() => GoalContributionModel, { name: 'contributeToGoal' })
  @UseGuards(JwtAuthGuard)
  contributeToGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ContributeGoalInput,
  ): Promise<GoalContributionModel> {
    return this.goalsService.contribute(user.id, input);
  }

  @Mutation(() => GoalContributionModel, { name: 'withdrawFromGoal' })
  @UseGuards(JwtAuthGuard)
  withdrawFromGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: WithdrawGoalInput,
  ): Promise<GoalContributionModel> {
    return this.goalsService.withdraw(user.id, input);
  }
}
