import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ArchiveHouseLoanInput } from './dto/archive-house-loan.input';
import { CreateHouseLoanInput } from './dto/create-house-loan.input';
import { DeleteHouseLoanInput } from './dto/delete-house-loan.input';
import { UpdateHouseLoanInput } from './dto/update-house-loan.input';
import { HouseLoanService } from './house-loan.service';
import { HouseLoanModel } from './models/house-loan.model';

@Resolver()
export class HouseLoanResolver {
  constructor(private readonly houseLoanService: HouseLoanService) {}

  @Query(() => [HouseLoanModel], { name: 'myHouseLoans' })
  @UseGuards(JwtAuthGuard)
  myHouseLoans(@CurrentUser() user: JwtUser): Promise<HouseLoanModel[]> {
    return this.houseLoanService.findMyHouseLoans(user.id);
  }

  @Query(() => HouseLoanModel, { name: 'houseLoanById' })
  @UseGuards(JwtAuthGuard)
  houseLoanById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<HouseLoanModel> {
    return this.houseLoanService.findByIdForUser(user.id, id);
  }

  @Query(() => [HouseLoanModel], { name: 'activeHouseLoans' })
  @UseGuards(JwtAuthGuard)
  activeHouseLoans(@CurrentUser() user: JwtUser): Promise<HouseLoanModel[]> {
    return this.houseLoanService.findActiveHouseLoans(user.id);
  }

  @Mutation(() => HouseLoanModel, { name: 'createHouseLoan' })
  @UseGuards(JwtAuthGuard)
  createHouseLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateHouseLoanInput,
  ): Promise<HouseLoanModel> {
    return this.houseLoanService.create(user.id, input);
  }

  @Mutation(() => HouseLoanModel, { name: 'updateHouseLoan' })
  @UseGuards(JwtAuthGuard)
  updateHouseLoan(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateHouseLoanInput,
  ): Promise<HouseLoanModel> {
    return this.houseLoanService.update(user.id, id, input);
  }

  @Mutation(() => HouseLoanModel, { name: 'archiveHouseLoan' })
  @UseGuards(JwtAuthGuard)
  archiveHouseLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveHouseLoanInput,
  ): Promise<HouseLoanModel> {
    return this.houseLoanService.archive(user.id, input.id);
  }

  @Mutation(() => Boolean, { name: 'deleteHouseLoan' })
  @UseGuards(JwtAuthGuard)
  deleteHouseLoan(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteHouseLoanInput,
  ): Promise<boolean> {
    return this.houseLoanService.delete(user.id, input.id);
  }
}
