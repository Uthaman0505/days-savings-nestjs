import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateInsurancePaymentInput } from './dto/create-insurance-payment.input';
import { DeleteInsurancePaymentInput } from './dto/delete-insurance-payment.input';
import { InsurancePaymentFilterInput } from './dto/insurance-payment-filter.input';
import { UpdateInsurancePaymentInput } from './dto/update-insurance-payment.input';
import { InsurancePaymentService } from './insurance-payment.service';
import { InsurancePaymentModel } from './models/insurance-payment.model';

@Resolver()
export class InsurancePaymentResolver {
  constructor(
    private readonly insurancePaymentService: InsurancePaymentService,
  ) {}

  @Query(() => [InsurancePaymentModel], { name: 'myInsurancePayments' })
  @UseGuards(JwtAuthGuard)
  myInsurancePayments(
    @CurrentUser() user: JwtUser,
    @Args('filter', {
      type: () => InsurancePaymentFilterInput,
      nullable: true,
    })
    filter?: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    return this.insurancePaymentService.findMyPayments(user.id, filter);
  }

  @Query(() => InsurancePaymentModel, { name: 'insurancePaymentById' })
  @UseGuards(JwtAuthGuard)
  insurancePaymentById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InsurancePaymentModel> {
    return this.insurancePaymentService.findByIdForUser(user.id, id);
  }

  @Query(() => [InsurancePaymentModel], { name: 'paymentsByInsurance' })
  @UseGuards(JwtAuthGuard)
  paymentsByInsurance(
    @CurrentUser() user: JwtUser,
    @Args('insuranceId', { type: () => ID }) insuranceId: string,
    @Args('filter', {
      type: () => InsurancePaymentFilterInput,
      nullable: true,
    })
    filter?: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    return this.insurancePaymentService.findByInsurance(
      user.id,
      insuranceId,
      filter,
    );
  }

  @Query(() => [InsurancePaymentModel], {
    name: 'insurancePaymentsByDateRange',
  })
  @UseGuards(JwtAuthGuard)
  insurancePaymentsByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', {
      type: () => InsurancePaymentFilterInput,
      nullable: true,
    })
    filter?: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    return this.insurancePaymentService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => InsurancePaymentModel, { name: 'createInsurancePayment' })
  @UseGuards(JwtAuthGuard)
  createInsurancePayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateInsurancePaymentInput,
  ): Promise<InsurancePaymentModel> {
    return this.insurancePaymentService.create(user.id, input);
  }

  @Mutation(() => InsurancePaymentModel, { name: 'updateInsurancePayment' })
  @UseGuards(JwtAuthGuard)
  updateInsurancePayment(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateInsurancePaymentInput,
  ): Promise<InsurancePaymentModel> {
    return this.insurancePaymentService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteInsurancePayment' })
  @UseGuards(JwtAuthGuard)
  deleteInsurancePayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteInsurancePaymentInput,
  ): Promise<boolean> {
    return this.insurancePaymentService.delete(user.id, input.id);
  }
}
