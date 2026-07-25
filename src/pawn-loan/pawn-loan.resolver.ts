import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AddCollateralInput,
  UpdateCollateralInput,
} from './dto/add-collateral.input';
import { CreatePawnLoanInput } from './dto/create-pawn-loan.input';
import {
  DeletePawnLoanInput,
  ForfeitPawnLoanInput,
  RedeemPawnLoanInput,
  UpdatePawnLoanStatusInput,
} from './dto/pawn-loan-actions.input';
import { PawnLoanFilterInput } from './dto/pawn-loan-filter.input';
import { RecordPawnPaymentInput } from './dto/record-pawn-payment.input';
import { RenewPawnLoanInput } from './dto/renew-pawn-loan.input';
import { UpdatePawnLoanInput } from './dto/update-pawn-loan.input';
import {
  PawnCollateralModel,
  PawnLoanModel,
  PawnPaymentModel,
  PawnRenewalModel,
  PawnTransactionModel,
} from './models/pawn-loan.model';
import { PawnLoanService } from './pawn-loan.service';

@Resolver()
export class PawnLoanResolver {
  constructor(private readonly pawnLoanService: PawnLoanService) {}

  @Query(() => [PawnLoanModel], { name: 'pawnLoans' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  pawnLoans(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => PawnLoanFilterInput, nullable: true })
    filter?: PawnLoanFilterInput,
  ): Promise<PawnLoanModel[]> {
    return this.pawnLoanService.findPawnLoans(user.id, filter);
  }

  @Query(() => PawnLoanModel, { name: 'pawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  pawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.findPawnLoan(user.id, id);
  }

  @Query(() => [PawnTransactionModel], { name: 'pawnLoanHistory' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  pawnLoanHistory(
    @CurrentUser() user: JwtUser,
    @Args('pawnLoanId', { type: () => ID }) pawnLoanId: string,
  ): Promise<PawnTransactionModel[]> {
    return this.pawnLoanService.findHistory(user.id, pawnLoanId);
  }

  @Query(() => [PawnCollateralModel], { name: 'pawnCollateral' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  pawnCollateral(
    @CurrentUser() user: JwtUser,
    @Args('pawnLoanId', { type: () => ID }) pawnLoanId: string,
  ): Promise<PawnCollateralModel[]> {
    return this.pawnLoanService.findCollateral(user.id, pawnLoanId);
  }

  @Query(() => [PawnPaymentModel], { name: 'pawnPayments' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  pawnPayments(
    @CurrentUser() user: JwtUser,
    @Args('pawnLoanId', { type: () => ID }) pawnLoanId: string,
  ): Promise<PawnPaymentModel[]> {
    return this.pawnLoanService.findPayments(user.id, pawnLoanId);
  }

  @Query(() => [PawnRenewalModel], { name: 'pawnRenewals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  pawnRenewals(
    @CurrentUser() user: JwtUser,
    @Args('pawnLoanId', { type: () => ID }) pawnLoanId: string,
  ): Promise<PawnRenewalModel[]> {
    return this.pawnLoanService.findRenewals(user.id, pawnLoanId);
  }

  @Mutation(() => PawnLoanModel, { name: 'createPawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  createPawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreatePawnLoanInput,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.create(user.id, input);
  }

  @Mutation(() => PawnLoanModel, { name: 'updatePawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  updatePawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdatePawnLoanInput,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.update(user.id, id, input);
  }

  @Mutation(() => PawnCollateralModel, { name: 'addCollateral' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  addCollateral(
    @CurrentUser() user: JwtUser,
    @Args('input') input: AddCollateralInput,
  ): Promise<PawnCollateralModel> {
    return this.pawnLoanService.addCollateral(user.id, input);
  }

  @Mutation(() => PawnCollateralModel, { name: 'updateCollateral' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  updateCollateral(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCollateralInput,
  ): Promise<PawnCollateralModel> {
    return this.pawnLoanService.updateCollateral(user.id, id, input);
  }

  @Mutation(() => PawnPaymentModel, { name: 'recordPayment' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  recordPayment(
    @CurrentUser() user: JwtUser,
    @Args('input') input: RecordPawnPaymentInput,
  ): Promise<PawnPaymentModel> {
    return this.pawnLoanService.recordPayment(user.id, input);
  }

  @Mutation(() => PawnLoanModel, { name: 'renewPawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  renewPawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: RenewPawnLoanInput,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.renew(user.id, input);
  }

  @Mutation(() => PawnLoanModel, { name: 'redeemPawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  redeemPawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: RedeemPawnLoanInput,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.redeem(user.id, input);
  }

  @Mutation(() => PawnLoanModel, { name: 'forfeitPawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  forfeitPawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ForfeitPawnLoanInput,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.forfeit(user.id, input);
  }

  @Mutation(() => PawnLoanModel, { name: 'updateStatus' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  updateStatus(
    @CurrentUser() user: JwtUser,
    @Args('input') input: UpdatePawnLoanStatusInput,
  ): Promise<PawnLoanModel> {
    return this.pawnLoanService.updateStatus(user.id, input);
  }

  @Mutation(() => Boolean, { name: 'deletePawnLoan' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'MANAGER', 'ADMIN')
  deletePawnLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeletePawnLoanInput,
  ): Promise<boolean> {
    return this.pawnLoanService.delete(user.id, input);
  }
}
