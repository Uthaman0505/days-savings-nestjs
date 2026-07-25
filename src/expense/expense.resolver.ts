import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateExpenseInput } from './dto/create-expense.input';
import { DeleteExpenseInput } from './dto/delete-expense.input';
import { ExpenseFilterInput } from './dto/expense-filter.input';
import { UpdateExpenseInput } from './dto/update-expense.input';
import { ExpenseService } from './expense.service';
import { ExpenseModel } from './models/expense.model';

@Resolver()
export class ExpenseResolver {
  constructor(private readonly expenseService: ExpenseService) {}

  @Query(() => [ExpenseModel], { name: 'myExpenses' })
  @UseGuards(JwtAuthGuard)
  myExpenses(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => ExpenseFilterInput, nullable: true })
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    return this.expenseService.findMyExpenses(user.id, filter);
  }

  @Query(() => ExpenseModel, { name: 'expenseById' })
  @UseGuards(JwtAuthGuard)
  expenseById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ExpenseModel> {
    return this.expenseService.findByIdForUser(user.id, id);
  }

  @Query(() => [ExpenseModel], { name: 'expenseByAccount' })
  @UseGuards(JwtAuthGuard)
  expenseByAccount(
    @CurrentUser() user: JwtUser,
    @Args('accountId', { type: () => ID }) accountId: string,
    @Args('filter', { type: () => ExpenseFilterInput, nullable: true })
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    return this.expenseService.findByAccount(user.id, accountId, filter);
  }

  @Query(() => [ExpenseModel], { name: 'expenseByCategory' })
  @UseGuards(JwtAuthGuard)
  expenseByCategory(
    @CurrentUser() user: JwtUser,
    @Args('categoryId', { type: () => ID }) categoryId: string,
    @Args('filter', { type: () => ExpenseFilterInput, nullable: true })
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    return this.expenseService.findByCategory(user.id, categoryId, filter);
  }

  @Query(() => [ExpenseModel], { name: 'expenseByDateRange' })
  @UseGuards(JwtAuthGuard)
  expenseByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', { type: () => ExpenseFilterInput, nullable: true })
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    return this.expenseService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => ExpenseModel, { name: 'createExpense' })
  @UseGuards(JwtAuthGuard)
  createExpense(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateExpenseInput,
  ): Promise<ExpenseModel> {
    return this.expenseService.create(user.id, input);
  }

  @Mutation(() => ExpenseModel, { name: 'updateExpense' })
  @UseGuards(JwtAuthGuard)
  updateExpense(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateExpenseInput,
  ): Promise<ExpenseModel> {
    return this.expenseService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteExpense' })
  @UseGuards(JwtAuthGuard)
  deleteExpense(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteExpenseInput,
  ): Promise<boolean> {
    return this.expenseService.delete(user.id, input.id);
  }
}
