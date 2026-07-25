import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreditCardService } from './credit-card.service';
import { ArchiveCreditCardInput } from './dto/archive-credit-card.input';
import { CreateCreditCardInput } from './dto/create-credit-card.input';
import { DeleteCreditCardInput } from './dto/delete-credit-card.input';
import { UpdateCreditCardInput } from './dto/update-credit-card.input';
import { CreditCardModel } from './models/credit-card.model';

@Resolver()
export class CreditCardResolver {
  constructor(private readonly creditCardService: CreditCardService) {}

  @Query(() => [CreditCardModel], { name: 'myCreditCards' })
  @UseGuards(JwtAuthGuard)
  myCreditCards(@CurrentUser() user: JwtUser): Promise<CreditCardModel[]> {
    return this.creditCardService.findMyCreditCards(user.id);
  }

  @Query(() => CreditCardModel, { name: 'creditCardById' })
  @UseGuards(JwtAuthGuard)
  creditCardById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CreditCardModel> {
    return this.creditCardService.findByIdForUser(user.id, id);
  }

  @Query(() => [CreditCardModel], { name: 'activeCreditCards' })
  @UseGuards(JwtAuthGuard)
  activeCreditCards(@CurrentUser() user: JwtUser): Promise<CreditCardModel[]> {
    return this.creditCardService.findActiveCreditCards(user.id);
  }

  @Mutation(() => CreditCardModel, { name: 'createCreditCard' })
  @UseGuards(JwtAuthGuard)
  createCreditCard(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateCreditCardInput,
  ): Promise<CreditCardModel> {
    return this.creditCardService.create(user.id, input);
  }

  @Mutation(() => CreditCardModel, { name: 'updateCreditCard' })
  @UseGuards(JwtAuthGuard)
  updateCreditCard(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCreditCardInput,
  ): Promise<CreditCardModel> {
    return this.creditCardService.update(user.id, id, input);
  }

  @Mutation(() => CreditCardModel, { name: 'archiveCreditCard' })
  @UseGuards(JwtAuthGuard)
  archiveCreditCard(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveCreditCardInput,
  ): Promise<CreditCardModel> {
    return this.creditCardService.archive(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteCreditCard' })
  @UseGuards(JwtAuthGuard)
  deleteCreditCard(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteCreditCardInput,
  ): Promise<boolean> {
    return this.creditCardService.delete(user.id, input.id);
  }
}
