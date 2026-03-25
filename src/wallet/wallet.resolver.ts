import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { JwtUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClaimChallengeDayInput } from './dto/claim-challenge-day.input';
import { MyChallengeRoomModel } from './models/my-challenge-room.model';
import { WalletService } from './wallet.service';

@Resolver()
export class WalletResolver {
  constructor(private readonly walletService: WalletService) {}

  @Query(() => MyChallengeRoomModel, { name: 'myChallengeRoom' })
  @UseGuards(JwtAuthGuard)
  myChallengeRoom(@CurrentUser() user: JwtUser): Promise<MyChallengeRoomModel> {
    return this.walletService.getMyChallengeRoom(user.id);
  }

  @Mutation(() => MyChallengeRoomModel, { name: 'claimChallengeDay' })
  @UseGuards(JwtAuthGuard)
  claimChallengeDay(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ClaimChallengeDayInput,
  ): Promise<MyChallengeRoomModel> {
    return this.walletService.claimChallengeDay(user.id, input.day_number);
  }

  @Mutation(() => MyChallengeRoomModel, {
    name: 'stopChallengeAndTransfer',
  })
  @UseGuards(JwtAuthGuard)
  stopChallengeAndTransfer(
    @CurrentUser() user: JwtUser,
  ): Promise<MyChallengeRoomModel> {
    return this.walletService.stopChallengeAndTransfer(user.id);
  }
}
