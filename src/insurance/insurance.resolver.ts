import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ArchiveInsuranceInput } from './dto/archive-insurance.input';
import { CreateInsuranceInput } from './dto/create-insurance.input';
import { DeleteInsuranceInput } from './dto/delete-insurance.input';
import { UpdateInsuranceInput } from './dto/update-insurance.input';
import { InsuranceService } from './insurance.service';
import { InsuranceModel } from './models/insurance.model';

@Resolver()
export class InsuranceResolver {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Query(() => [InsuranceModel], { name: 'myInsurancePolicies' })
  @UseGuards(JwtAuthGuard)
  myInsurancePolicies(@CurrentUser() user: JwtUser): Promise<InsuranceModel[]> {
    return this.insuranceService.findMyPolicies(user.id);
  }

  @Query(() => InsuranceModel, { name: 'insurancePolicyById' })
  @UseGuards(JwtAuthGuard)
  insurancePolicyById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<InsuranceModel> {
    return this.insuranceService.findByIdForUser(user.id, id);
  }

  @Query(() => [InsuranceModel], { name: 'activeInsurancePolicies' })
  @UseGuards(JwtAuthGuard)
  activeInsurancePolicies(
    @CurrentUser() user: JwtUser,
  ): Promise<InsuranceModel[]> {
    return this.insuranceService.findActivePolicies(user.id);
  }

  @Query(() => [InsuranceModel], { name: 'insurancePoliciesByType' })
  @UseGuards(JwtAuthGuard)
  insurancePoliciesByType(
    @CurrentUser() user: JwtUser,
    @Args('type', { type: () => String }) type: string,
  ): Promise<InsuranceModel[]> {
    return this.insuranceService.findByType(user.id, type);
  }

  @Mutation(() => InsuranceModel, { name: 'createInsurancePolicy' })
  @UseGuards(JwtAuthGuard)
  createInsurancePolicy(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateInsuranceInput,
  ): Promise<InsuranceModel> {
    return this.insuranceService.create(user.id, input);
  }

  @Mutation(() => InsuranceModel, { name: 'updateInsurancePolicy' })
  @UseGuards(JwtAuthGuard)
  updateInsurancePolicy(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateInsuranceInput,
  ): Promise<InsuranceModel> {
    return this.insuranceService.update(user.id, id, input);
  }

  @Mutation(() => InsuranceModel, { name: 'archiveInsurancePolicy' })
  @UseGuards(JwtAuthGuard)
  archiveInsurancePolicy(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveInsuranceInput,
  ): Promise<InsuranceModel> {
    return this.insuranceService.archive(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteInsurancePolicy' })
  @UseGuards(JwtAuthGuard)
  deleteInsurancePolicy(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteInsuranceInput,
  ): Promise<boolean> {
    return this.insuranceService.delete(user.id, input.id);
  }
}
