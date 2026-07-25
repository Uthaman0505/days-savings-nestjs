import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreditCardPaymentService } from './credit-card-payment.service';
import { CreateCreditCardPaymentInput } from './dto/create-credit-card-payment.input';
import { CreditCardPaymentFilterInput } from './dto/credit-card-payment-filter.input';
import { DeleteCreditCardPaymentInput } from './dto/delete-credit-card-payment.input';
import { UpdateCreditCardPaymentInput } from './dto/update-credit-card-payment.input';
import { CreditCardPaymentModel } from './models/credit-card-payment.model';

@Resolver()
export class CreditCardPaymentResolver {
  constructor(
    private readonly creditCardPaymentService: CreditCardPaymentService,
  ) {}

  @Query(() => [CreditCardPaymentModel], { name: 'myCreditCardPayments' })
  @UseGuards(JwtAuthGuard)
  myCreditCardPayments(
    @CurrentUser() user: JwtUser,
    @Args('filter', {
      type: () => CreditCardPaymentFilterInput,
      nullable: true,
    })
    filter?: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    return this.creditCardPaymentService.findMyPayments(user.id, filter);
  }

  @Query(() => CreditCardPaymentModel, { name: 'creditCardPaymentById' })
  @UseGuards(JwtAuthGuard)
  creditCardPaymentById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CreditCardPaymentModel> {
    return this.creditCardPaymentService.findByIdForUser(user.id, id);
  }

  @Query(() => [CreditCardPaymentModel], { name: 'paymentsByCard' })
  @UseGuards(JwtAuthGuard)
  paymentsByCard(
    @CurrentUser() user: JwtUser,
    @Args('creditCardId', { type: () => ID }) creditCardId: string,
    @Args('filter', {
      type: () => CreditCardPaymentFilterInput,
      nullable: true,
    })
    filter?: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    return this.creditCardPaymentService.findByCard(
      user.id,
      creditCardId,
      filter,
    );
  }

  @Query(() => [CreditCardPaymentModel], { name: 'paymentsByDateRange' })
  @UseGuards(JwtAuthGuard)
  paymentsByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', {
      type: () => CreditCardPaymentFilterInput,
      nullable: true,
    })
    filter?: CreditCardPaymentFilterInput,
  ): Promise<CreditCardPaymentModel[]> {
    return this.creditCardPaymentService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => CreditCardPaymentModel, { name: 'createCreditCardPayment' })
  @UseGuards(JwtAuthGuard)
  createCreditCardPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateCreditCardPaymentInput,
  ): Promise<CreditCardPaymentModel> {
    return this.creditCardPaymentService.create(user.id, input);
  }

  @Mutation(() => CreditCardPaymentModel, { name: 'updateCreditCardPayment' })
  @UseGuards(JwtAuthGuard)
  updateCreditCardPayment(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCreditCardPaymentInput,
  ): Promise<CreditCardPaymentModel> {
    return this.creditCardPaymentService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteCreditCardPayment' })
  @UseGuards(JwtAuthGuard)
  deleteCreditCardPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteCreditCardPaymentInput,
  ): Promise<boolean> {
    return this.creditCardPaymentService.delete(user.id, input.id);
  }
}
