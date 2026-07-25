import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateIncomeInput } from './dto/create-income.input';
import { DeleteIncomeInput } from './dto/delete-income.input';
import { IncomeFilterInput } from './dto/income-filter.input';
import { UpdateIncomeInput } from './dto/update-income.input';
import { IncomeService } from './income.service';
import { IncomeModel } from './models/income.model';

@Resolver()
export class IncomeResolver {
  constructor(private readonly incomeService: IncomeService) {}

  @Query(() => [IncomeModel], { name: 'myIncome' })
  @UseGuards(JwtAuthGuard)
  myIncome(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => IncomeFilterInput, nullable: true })
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    return this.incomeService.findMyIncome(user.id, filter);
  }

  @Query(() => IncomeModel, { name: 'incomeById' })
  @UseGuards(JwtAuthGuard)
  incomeById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<IncomeModel> {
    return this.incomeService.findByIdForUser(user.id, id);
  }

  @Query(() => [IncomeModel], { name: 'incomeByAccount' })
  @UseGuards(JwtAuthGuard)
  incomeByAccount(
    @CurrentUser() user: JwtUser,
    @Args('accountId', { type: () => ID }) accountId: string,
    @Args('filter', { type: () => IncomeFilterInput, nullable: true })
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    return this.incomeService.findByAccount(user.id, accountId, filter);
  }

  @Query(() => [IncomeModel], { name: 'incomeByCategory' })
  @UseGuards(JwtAuthGuard)
  incomeByCategory(
    @CurrentUser() user: JwtUser,
    @Args('categoryId', { type: () => ID }) categoryId: string,
    @Args('filter', { type: () => IncomeFilterInput, nullable: true })
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    return this.incomeService.findByCategory(user.id, categoryId, filter);
  }

  @Query(() => [IncomeModel], { name: 'incomeByDateRange' })
  @UseGuards(JwtAuthGuard)
  incomeByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', { type: () => IncomeFilterInput, nullable: true })
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    return this.incomeService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => IncomeModel, { name: 'createIncome' })
  @UseGuards(JwtAuthGuard)
  createIncome(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateIncomeInput,
  ): Promise<IncomeModel> {
    return this.incomeService.create(user.id, input);
  }

  @Mutation(() => IncomeModel, { name: 'updateIncome' })
  @UseGuards(JwtAuthGuard)
  updateIncome(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateIncomeInput,
  ): Promise<IncomeModel> {
    return this.incomeService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteIncome' })
  @UseGuards(JwtAuthGuard)
  deleteIncome(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteIncomeInput,
  ): Promise<boolean> {
    return this.incomeService.delete(user.id, input.id);
  }
}
