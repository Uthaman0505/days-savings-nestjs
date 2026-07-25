import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateRecurringTransactionInput } from './dto/create-recurring-transaction.input';
import { DeleteRecurringTransactionInput } from './dto/delete-recurring-transaction.input';
import { PauseRecurringTransactionInput } from './dto/pause-recurring-transaction.input';
import { RecurringTransactionFilterInput } from './dto/recurring-transaction-filter.input';
import { ResumeRecurringTransactionInput } from './dto/resume-recurring-transaction.input';
import { RunRecurringTransactionNowInput } from './dto/run-recurring-transaction-now.input';
import { UpdateRecurringTransactionInput } from './dto/update-recurring-transaction.input';
import { RecurringTransactionModel } from './models/recurring-transaction.model';
import { RecurringTransactionService } from './recurring-transaction.service';

@Resolver()
export class RecurringTransactionResolver {
  constructor(
    private readonly recurringTransactionService: RecurringTransactionService,
  ) {}

  @Query(() => [RecurringTransactionModel], {
    name: 'myRecurringTransactions',
  })
  @UseGuards(JwtAuthGuard)
  myRecurringTransactions(
    @CurrentUser() user: JwtUser,
    @Args('filter', {
      type: () => RecurringTransactionFilterInput,
      nullable: true,
    })
    filter?: RecurringTransactionFilterInput,
  ): Promise<RecurringTransactionModel[]> {
    return this.recurringTransactionService.findMyRecurring(user.id, filter);
  }

  @Query(() => RecurringTransactionModel, {
    name: 'recurringTransactionById',
  })
  @UseGuards(JwtAuthGuard)
  recurringTransactionById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<RecurringTransactionModel> {
    return this.recurringTransactionService.findByIdForUser(user.id, id);
  }

  @Query(() => [RecurringTransactionModel], {
    name: 'activeRecurringTransactions',
  })
  @UseGuards(JwtAuthGuard)
  activeRecurringTransactions(
    @CurrentUser() user: JwtUser,
  ): Promise<RecurringTransactionModel[]> {
    return this.recurringTransactionService.findActiveRecurring(user.id);
  }

  @Query(() => [RecurringTransactionModel], {
    name: 'upcomingRecurringTransactions',
  })
  @UseGuards(JwtAuthGuard)
  upcomingRecurringTransactions(
    @CurrentUser() user: JwtUser,
    @Args('withinDays', { type: () => Int, nullable: true, defaultValue: 30 })
    withinDays?: number,
  ): Promise<RecurringTransactionModel[]> {
    return this.recurringTransactionService.findUpcoming(
      user.id,
      withinDays ?? 30,
    );
  }

  @Mutation(() => RecurringTransactionModel, {
    name: 'createRecurringTransaction',
  })
  @UseGuards(JwtAuthGuard)
  createRecurringTransaction(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateRecurringTransactionInput,
  ): Promise<RecurringTransactionModel> {
    return this.recurringTransactionService.create(user.id, input);
  }

  @Mutation(() => RecurringTransactionModel, {
    name: 'updateRecurringTransaction',
  })
  @UseGuards(JwtAuthGuard)
  updateRecurringTransaction(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateRecurringTransactionInput,
  ): Promise<RecurringTransactionModel> {
    return this.recurringTransactionService.update(user.id, id, input);
  }

  @Mutation(() => RecurringTransactionModel, {
    name: 'pauseRecurringTransaction',
  })
  @UseGuards(JwtAuthGuard)
  pauseRecurringTransaction(
    @CurrentUser() user: JwtUser,
    @Args('input') input: PauseRecurringTransactionInput,
  ): Promise<RecurringTransactionModel> {
    return this.recurringTransactionService.pause(user.id, input.id);
  }

  @Mutation(() => RecurringTransactionModel, {
    name: 'resumeRecurringTransaction',
  })
  @UseGuards(JwtAuthGuard)
  resumeRecurringTransaction(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ResumeRecurringTransactionInput,
  ): Promise<RecurringTransactionModel> {
    return this.recurringTransactionService.resume(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteRecurringTransaction' })
  @UseGuards(JwtAuthGuard)
  deleteRecurringTransaction(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteRecurringTransactionInput,
  ): Promise<boolean> {
    return this.recurringTransactionService.delete(user.id, input.id);
  }

  @Mutation(() => RecurringTransactionModel, {
    name: 'runRecurringTransactionNow',
  })
  @UseGuards(JwtAuthGuard)
  runRecurringTransactionNow(
    @CurrentUser() user: JwtUser,
    @Args('input') input: RunRecurringTransactionNowInput,
  ): Promise<RecurringTransactionModel> {
    return this.recurringTransactionService.runNow(user.id, input.id);
  }
}
