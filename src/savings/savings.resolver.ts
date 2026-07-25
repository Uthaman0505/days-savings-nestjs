import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ArchiveSavingsInput } from './dto/archive-savings.input';
import { CreateSavingsInput } from './dto/create-savings.input';
import { DeleteSavingsInput } from './dto/delete-savings.input';
import { DepositToSavingsInput } from './dto/deposit-to-savings.input';
import { SavingsFilterInput } from './dto/savings-filter.input';
import { UpdateSavingsInput } from './dto/update-savings.input';
import { WithdrawFromSavingsInput } from './dto/withdraw-from-savings.input';
import { SavingsModel } from './models/savings.model';
import { SavingsService } from './savings.service';

@Resolver()
export class SavingsResolver {
  constructor(private readonly savingsService: SavingsService) {}

  @Query(() => [SavingsModel], { name: 'mySavings' })
  @UseGuards(JwtAuthGuard)
  mySavings(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => SavingsFilterInput, nullable: true })
    filter?: SavingsFilterInput,
  ): Promise<SavingsModel[]> {
    return this.savingsService.findMySavings(user.id, filter);
  }

  @Query(() => SavingsModel, { name: 'savingById' })
  @UseGuards(JwtAuthGuard)
  savingById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SavingsModel> {
    return this.savingsService.findByIdForUser(user.id, id);
  }

  @Query(() => [SavingsModel], { name: 'activeSavings' })
  @UseGuards(JwtAuthGuard)
  activeSavings(@CurrentUser() user: JwtUser): Promise<SavingsModel[]> {
    return this.savingsService.findActiveSavings(user.id);
  }

  @Query(() => [SavingsModel], { name: 'savingsByType' })
  @UseGuards(JwtAuthGuard)
  savingsByType(
    @CurrentUser() user: JwtUser,
    @Args('type', { type: () => String }) type: string,
  ): Promise<SavingsModel[]> {
    return this.savingsService.findByType(user.id, type);
  }

  @Mutation(() => SavingsModel, { name: 'createSavings' })
  @UseGuards(JwtAuthGuard)
  createSavings(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateSavingsInput,
  ): Promise<SavingsModel> {
    return this.savingsService.create(user.id, input);
  }

  @Mutation(() => SavingsModel, { name: 'updateSavings' })
  @UseGuards(JwtAuthGuard)
  updateSavings(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateSavingsInput,
  ): Promise<SavingsModel> {
    return this.savingsService.update(user.id, id, input);
  }

  @Mutation(() => SavingsModel, { name: 'archiveSavings' })
  @UseGuards(JwtAuthGuard)
  archiveSavings(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveSavingsInput,
  ): Promise<SavingsModel> {
    return this.savingsService.archive(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteSavings' })
  @UseGuards(JwtAuthGuard)
  deleteSavings(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteSavingsInput,
  ): Promise<boolean> {
    return this.savingsService.delete(user.id, input.id);
  }

  @Mutation(() => SavingsModel, { name: 'depositToSavings' })
  @UseGuards(JwtAuthGuard)
  depositToSavings(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DepositToSavingsInput,
  ): Promise<SavingsModel> {
    return this.savingsService.deposit(user.id, input);
  }

  @Mutation(() => SavingsModel, { name: 'withdrawFromSavings' })
  @UseGuards(JwtAuthGuard)
  withdrawFromSavings(
    @CurrentUser() user: JwtUser,
    @Args('input') input: WithdrawFromSavingsInput,
  ): Promise<SavingsModel> {
    return this.savingsService.withdraw(user.id, input);
  }
}
