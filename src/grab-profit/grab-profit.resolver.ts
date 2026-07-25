import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CalculateGrabProfitInput } from './dto/calculate-grab-profit.input';
import { GrabProfitResultModel } from './models/grab-profit-result.model';
import { GrabProfitService } from './grab-profit.service';

@Resolver()
export class GrabProfitResolver {
  constructor(private readonly grabProfitService: GrabProfitService) {}

  @Mutation(() => GrabProfitResultModel, { name: 'calculateGrabProfit' })
  @UseGuards(JwtAuthGuard)
  calculateGrabProfit(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CalculateGrabProfitInput,
  ): Promise<GrabProfitResultModel> {
    return this.grabProfitService.calculateAndSaveDailyProfit(user.id, input);
  }
}
