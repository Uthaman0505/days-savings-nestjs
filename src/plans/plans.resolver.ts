import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../auth/current-user.decorator';
import { SelectDaysInput } from './dto/select-days.input';
import { UseGuards } from '@nestjs/common';
import { ActiveSavingPlanModel } from './models/active-saving-plan.model';
import { SavingPlanModel } from './models/saving-plan.model';

@Resolver()
export class PlansResolver {
  constructor(private readonly plansService: PlansService) {}

  @Mutation(() => ActiveSavingPlanModel, { name: 'subscribeToDays' })
  @UseGuards(JwtAuthGuard)
  subscribeToDays(
    @CurrentUser() user: JwtUser,
    @Args('input') input: SelectDaysInput,
  ): Promise<ActiveSavingPlanModel> {
    return this.plansService.subscribeToDays(user.id, input.total_days);
  }

  @Query(() => ActiveSavingPlanModel, {
    name: 'myActiveChallenge',
    nullable: true,
  })
  @UseGuards(JwtAuthGuard)
  myActiveChallenge(
    @CurrentUser() user: JwtUser,
  ): Promise<ActiveSavingPlanModel | null> {
    return this.plansService.findActiveUserChallenge(user.id);
  }

  @Query(() => [SavingPlanModel], { name: 'plans' })
  plans(): Promise<SavingPlanModel[]> {
    return this.plansService.findActivePlans();
  }

  @Query(() => [Int], {
    name: 'myCompletedPlanTotalDays',
    description:
      'Day counts the user cannot start again (completed challenge or gave up).',
  })
  @UseGuards(JwtAuthGuard)
  myCompletedPlanTotalDays(@CurrentUser() user: JwtUser): Promise<number[]> {
    return this.plansService.findCompletedTotalDaysForUser(user.id);
  }
}
