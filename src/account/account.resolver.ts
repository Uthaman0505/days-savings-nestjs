import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { AccountService } from './account.service';
import { CreateAccountInput } from './dto/create-account.input';
import { UpdateAccountInput } from './dto/update-account.input';
import { AccountModel } from './models/account.model';

@Resolver()
export class AccountResolver {
  constructor(private readonly accountService: AccountService) {}

  @Query(() => [AccountModel], { name: 'myAccounts' })
  @UseGuards(JwtAuthGuard)
  myAccounts(@CurrentUser() user: JwtUser): Promise<AccountModel[]> {
    return this.accountService.findMyAccounts(user.id);
  }

  @Query(() => AccountModel, { name: 'accountById' })
  @UseGuards(JwtAuthGuard)
  accountById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AccountModel> {
    return this.accountService.findByIdForUser(user.id, id);
  }

  @Mutation(() => AccountModel, { name: 'createAccount' })
  @UseGuards(JwtAuthGuard)
  createAccount(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateAccountInput,
  ): Promise<AccountModel> {
    return this.accountService.create(user.id, input);
  }

  @Mutation(() => AccountModel, { name: 'updateAccount' })
  @UseGuards(JwtAuthGuard)
  updateAccount(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateAccountInput,
  ): Promise<AccountModel> {
    return this.accountService.update(user.id, id, input);
  }

  @Mutation(() => AccountModel, { name: 'archiveAccount' })
  @UseGuards(JwtAuthGuard)
  archiveAccount(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AccountModel> {
    return this.accountService.archive(user.id, id);
  }

  @Mutation(() => Boolean, { name: 'deleteAccount' })
  @UseGuards(JwtAuthGuard)
  deleteAccount(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.accountService.delete(user.id, id);
  }

  @Mutation(() => AccountModel, { name: 'setDefaultAccount' })
  @UseGuards(JwtAuthGuard)
  setDefaultAccount(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AccountModel> {
    return this.accountService.setDefault(user.id, id);
  }
}
