import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateHouseLoanPaymentInput } from './dto/create-house-loan-payment.input';
import { DeleteHouseLoanPaymentInput } from './dto/delete-house-loan-payment.input';
import { HouseLoanPaymentFilterInput } from './dto/house-loan-payment-filter.input';
import { UpdateHouseLoanPaymentInput } from './dto/update-house-loan-payment.input';
import { HouseLoanPaymentService } from './house-loan-payment.service';
import { HouseLoanPaymentModel } from './models/house-loan-payment.model';

@Resolver()
export class HouseLoanPaymentResolver {
  constructor(
    private readonly houseLoanPaymentService: HouseLoanPaymentService,
  ) {}

  @Query(() => [HouseLoanPaymentModel], { name: 'myHouseLoanPayments' })
  @UseGuards(JwtAuthGuard)
  myHouseLoanPayments(
    @CurrentUser() user: JwtUser,
    @Args('filter', {
      type: () => HouseLoanPaymentFilterInput,
      nullable: true,
    })
    filter?: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
    return this.houseLoanPaymentService.findMyPayments(user.id, filter);
  }

  @Query(() => HouseLoanPaymentModel, { name: 'houseLoanPaymentById' })
  @UseGuards(JwtAuthGuard)
  houseLoanPaymentById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<HouseLoanPaymentModel> {
    return this.houseLoanPaymentService.findByIdForUser(user.id, id);
  }

  @Query(() => [HouseLoanPaymentModel], { name: 'paymentsByLoan' })
  @UseGuards(JwtAuthGuard)
  paymentsByLoan(
    @CurrentUser() user: JwtUser,
    @Args('houseLoanId', { type: () => ID }) houseLoanId: string,
    @Args('filter', {
      type: () => HouseLoanPaymentFilterInput,
      nullable: true,
    })
    filter?: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
    return this.houseLoanPaymentService.findByLoan(
      user.id,
      houseLoanId,
      filter,
    );
  }

  @Query(() => [HouseLoanPaymentModel], {
    name: 'houseLoanPaymentsByDateRange',
  })
  @UseGuards(JwtAuthGuard)
  houseLoanPaymentsByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', {
      type: () => HouseLoanPaymentFilterInput,
      nullable: true,
    })
    filter?: HouseLoanPaymentFilterInput,
  ): Promise<HouseLoanPaymentModel[]> {
    return this.houseLoanPaymentService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => HouseLoanPaymentModel, { name: 'createHouseLoanPayment' })
  @UseGuards(JwtAuthGuard)
  createHouseLoanPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateHouseLoanPaymentInput,
  ): Promise<HouseLoanPaymentModel> {
    return this.houseLoanPaymentService.create(user.id, input);
  }

  @Mutation(() => HouseLoanPaymentModel, { name: 'updateHouseLoanPayment' })
  @UseGuards(JwtAuthGuard)
  updateHouseLoanPayment(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateHouseLoanPaymentInput,
  ): Promise<HouseLoanPaymentModel> {
    return this.houseLoanPaymentService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteHouseLoanPayment' })
  @UseGuards(JwtAuthGuard)
  deleteHouseLoanPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteHouseLoanPaymentInput,
  ): Promise<boolean> {
    return this.houseLoanPaymentService.delete(user.id, input.id);
  }
}
