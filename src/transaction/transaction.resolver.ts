import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateTransactionInput } from './dto/create-transaction.input';
import { DeleteTransactionInput } from './dto/delete-transaction.input';
import { TransactionFilterInput } from './dto/transaction-filter.input';
import { UpdateTransactionInput } from './dto/update-transaction.input';
import { TransactionModel } from './models/transaction.model';
import { TransactionService } from './transaction.service';

@Resolver()
export class TransactionResolver {
  constructor(private readonly transactionService: TransactionService) {}

  @Query(() => [TransactionModel], { name: 'myTransactions' })
  @UseGuards(JwtAuthGuard)
  myTransactions(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => TransactionFilterInput, nullable: true })
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    return this.transactionService.findMyTransactions(user.id, filter);
  }

  @Query(() => TransactionModel, { name: 'transactionById' })
  @UseGuards(JwtAuthGuard)
  transactionById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TransactionModel> {
    return this.transactionService.findByIdForUser(user.id, id);
  }

  @Query(() => [TransactionModel], { name: 'transactionsByAccount' })
  @UseGuards(JwtAuthGuard)
  transactionsByAccount(
    @CurrentUser() user: JwtUser,
    @Args('accountId', { type: () => ID }) accountId: string,
    @Args('filter', { type: () => TransactionFilterInput, nullable: true })
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    return this.transactionService.findByAccount(user.id, accountId, filter);
  }

  @Query(() => [TransactionModel], { name: 'transactionsByCategory' })
  @UseGuards(JwtAuthGuard)
  transactionsByCategory(
    @CurrentUser() user: JwtUser,
    @Args('categoryId', { type: () => ID }) categoryId: string,
    @Args('filter', { type: () => TransactionFilterInput, nullable: true })
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    return this.transactionService.findByCategory(user.id, categoryId, filter);
  }

  @Query(() => [TransactionModel], { name: 'transactionsByDateRange' })
  @UseGuards(JwtAuthGuard)
  transactionsByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', { type: () => TransactionFilterInput, nullable: true })
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    return this.transactionService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => TransactionModel, { name: 'createTransaction' })
  @UseGuards(JwtAuthGuard)
  createTransaction(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateTransactionInput,
  ): Promise<TransactionModel> {
    return this.transactionService.create(user.id, input);
  }

  @Mutation(() => TransactionModel, { name: 'updateTransaction' })
  @UseGuards(JwtAuthGuard)
  updateTransaction(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateTransactionInput,
  ): Promise<TransactionModel> {
    return this.transactionService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteTransaction' })
  @UseGuards(JwtAuthGuard)
  deleteTransaction(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteTransactionInput,
  ): Promise<boolean> {
    return this.transactionService.delete(user.id, input.id);
  }
}
