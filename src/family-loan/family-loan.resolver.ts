import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ArchiveFamilyLoanInput } from './dto/archive-family-loan.input';
import { CreateFamilyLoanInput } from './dto/create-family-loan.input';
import { DeleteFamilyLoanInput } from './dto/delete-family-loan.input';
import { FamilyLoanFilterInput } from './dto/family-loan-filter.input';
import { UpdateFamilyLoanInput } from './dto/update-family-loan.input';
import { FamilyLoanService } from './family-loan.service';
import { FamilyLoanModel } from './models/family-loan.model';

@Resolver()
export class FamilyLoanResolver {
  constructor(private readonly familyLoanService: FamilyLoanService) {}

  @Query(() => [FamilyLoanModel], { name: 'myFamilyLoans' })
  @UseGuards(JwtAuthGuard)
  myFamilyLoans(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => FamilyLoanFilterInput, nullable: true })
    filter?: FamilyLoanFilterInput,
  ): Promise<FamilyLoanModel[]> {
    return this.familyLoanService.findMyFamilyLoans(user.id, filter);
  }

  @Query(() => FamilyLoanModel, { name: 'familyLoanById' })
  @UseGuards(JwtAuthGuard)
  familyLoanById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<FamilyLoanModel> {
    return this.familyLoanService.findByIdForUser(user.id, id);
  }

  @Query(() => [FamilyLoanModel], { name: 'activeFamilyLoans' })
  @UseGuards(JwtAuthGuard)
  activeFamilyLoans(@CurrentUser() user: JwtUser): Promise<FamilyLoanModel[]> {
    return this.familyLoanService.findActiveFamilyLoans(user.id);
  }

  @Query(() => [FamilyLoanModel], { name: 'familyLoansByType' })
  @UseGuards(JwtAuthGuard)
  familyLoansByType(
    @CurrentUser() user: JwtUser,
    @Args('type', { type: () => String }) type: string,
  ): Promise<FamilyLoanModel[]> {
    return this.familyLoanService.findByType(user.id, type);
  }

  @Mutation(() => FamilyLoanModel, { name: 'createFamilyLoan' })
  @UseGuards(JwtAuthGuard)
  createFamilyLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateFamilyLoanInput,
  ): Promise<FamilyLoanModel> {
    return this.familyLoanService.create(user.id, input);
  }

  @Mutation(() => FamilyLoanModel, { name: 'updateFamilyLoan' })
  @UseGuards(JwtAuthGuard)
  updateFamilyLoan(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateFamilyLoanInput,
  ): Promise<FamilyLoanModel> {
    return this.familyLoanService.update(user.id, id, input);
  }

  @Mutation(() => FamilyLoanModel, { name: 'archiveFamilyLoan' })
  @UseGuards(JwtAuthGuard)
  archiveFamilyLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveFamilyLoanInput,
  ): Promise<FamilyLoanModel> {
    return this.familyLoanService.archive(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteFamilyLoan' })
  @UseGuards(JwtAuthGuard)
  deleteFamilyLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteFamilyLoanInput,
  ): Promise<boolean> {
    return this.familyLoanService.delete(user.id, input.id);
  }
}
