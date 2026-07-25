import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateFamilyLoanPaymentInput } from './dto/create-family-loan-payment.input';
import { DeleteFamilyLoanPaymentInput } from './dto/delete-family-loan-payment.input';
import { FamilyLoanPaymentFilterInput } from './dto/family-loan-payment-filter.input';
import { UpdateFamilyLoanPaymentInput } from './dto/update-family-loan-payment.input';
import { FamilyLoanPaymentService } from './family-loan-payment.service';
import { FamilyLoanPaymentModel } from './models/family-loan-payment.model';

@Resolver()
export class FamilyLoanPaymentResolver {
  constructor(
    private readonly familyLoanPaymentService: FamilyLoanPaymentService,
  ) {}

  @Query(() => [FamilyLoanPaymentModel], { name: 'myFamilyLoanPayments' })
  @UseGuards(JwtAuthGuard)
  myFamilyLoanPayments(
    @CurrentUser() user: JwtUser,
    @Args('filter', {
      type: () => FamilyLoanPaymentFilterInput,
      nullable: true,
    })
    filter?: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
    return this.familyLoanPaymentService.findMyPayments(user.id, filter);
  }

  @Query(() => FamilyLoanPaymentModel, { name: 'familyLoanPaymentById' })
  @UseGuards(JwtAuthGuard)
  familyLoanPaymentById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<FamilyLoanPaymentModel> {
    return this.familyLoanPaymentService.findByIdForUser(user.id, id);
  }

  /** Prefixed to avoid GraphQL clash with house-loan `paymentsByLoan`. */
  @Query(() => [FamilyLoanPaymentModel], {
    name: 'familyLoanPaymentsByLoan',
  })
  @UseGuards(JwtAuthGuard)
  familyLoanPaymentsByLoan(
    @CurrentUser() user: JwtUser,
    @Args('familyLoanId', { type: () => ID }) familyLoanId: string,
    @Args('filter', {
      type: () => FamilyLoanPaymentFilterInput,
      nullable: true,
    })
    filter?: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
    return this.familyLoanPaymentService.findByLoan(
      user.id,
      familyLoanId,
      filter,
    );
  }

  /** Prefixed to avoid GraphQL clash with other payment date-range queries. */
  @Query(() => [FamilyLoanPaymentModel], {
    name: 'familyLoanPaymentsByDateRange',
  })
  @UseGuards(JwtAuthGuard)
  familyLoanPaymentsByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', {
      type: () => FamilyLoanPaymentFilterInput,
      nullable: true,
    })
    filter?: FamilyLoanPaymentFilterInput,
  ): Promise<FamilyLoanPaymentModel[]> {
    return this.familyLoanPaymentService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => FamilyLoanPaymentModel, { name: 'createFamilyLoanPayment' })
  @UseGuards(JwtAuthGuard)
  createFamilyLoanPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateFamilyLoanPaymentInput,
  ): Promise<FamilyLoanPaymentModel> {
    return this.familyLoanPaymentService.create(user.id, input);
  }

  @Mutation(() => FamilyLoanPaymentModel, { name: 'updateFamilyLoanPayment' })
  @UseGuards(JwtAuthGuard)
  updateFamilyLoanPayment(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateFamilyLoanPaymentInput,
  ): Promise<FamilyLoanPaymentModel> {
    return this.familyLoanPaymentService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteFamilyLoanPayment' })
  @UseGuards(JwtAuthGuard)
  deleteFamilyLoanPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteFamilyLoanPaymentInput,
  ): Promise<boolean> {
    return this.familyLoanPaymentService.delete(user.id, input.id);
  }
}
