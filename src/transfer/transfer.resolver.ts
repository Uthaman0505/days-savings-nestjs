import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateTransferInput } from './dto/create-transfer.input';
import { DeleteTransferInput } from './dto/delete-transfer.input';
import { TransferFilterInput } from './dto/transfer-filter.input';
import { UpdateTransferInput } from './dto/update-transfer.input';
import { TransferModel } from './models/transfer.model';
import { TransferService } from './transfer.service';

@Resolver()
export class TransferResolver {
  constructor(private readonly transferService: TransferService) {}

  @Query(() => [TransferModel], { name: 'myTransfers' })
  @UseGuards(JwtAuthGuard)
  myTransfers(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => TransferFilterInput, nullable: true })
    filter?: TransferFilterInput,
  ): Promise<TransferModel[]> {
    return this.transferService.findMyTransfers(user.id, filter);
  }

  @Query(() => TransferModel, { name: 'transferById' })
  @UseGuards(JwtAuthGuard)
  transferById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<TransferModel> {
    return this.transferService.findByIdForUser(user.id, id);
  }

  @Query(() => [TransferModel], { name: 'transfersByAccount' })
  @UseGuards(JwtAuthGuard)
  transfersByAccount(
    @CurrentUser() user: JwtUser,
    @Args('accountId', { type: () => ID }) accountId: string,
    @Args('filter', { type: () => TransferFilterInput, nullable: true })
    filter?: TransferFilterInput,
  ): Promise<TransferModel[]> {
    return this.transferService.findByAccount(user.id, accountId, filter);
  }

  @Query(() => [TransferModel], { name: 'transfersByDateRange' })
  @UseGuards(JwtAuthGuard)
  transfersByDateRange(
    @CurrentUser() user: JwtUser,
    @Args('startDate', { type: () => Date }) startDate: Date,
    @Args('endDate', { type: () => Date }) endDate: Date,
    @Args('filter', { type: () => TransferFilterInput, nullable: true })
    filter?: TransferFilterInput,
  ): Promise<TransferModel[]> {
    return this.transferService.findByDateRange(
      user.id,
      startDate,
      endDate,
      filter,
    );
  }

  @Mutation(() => TransferModel, { name: 'createTransfer' })
  @UseGuards(JwtAuthGuard)
  createTransfer(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateTransferInput,
  ): Promise<TransferModel> {
    return this.transferService.create(user.id, input);
  }

  @Mutation(() => TransferModel, { name: 'updateTransfer' })
  @UseGuards(JwtAuthGuard)
  updateTransfer(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateTransferInput,
  ): Promise<TransferModel> {
    return this.transferService.update(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteTransfer' })
  @UseGuards(JwtAuthGuard)
  deleteTransfer(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteTransferInput,
  ): Promise<boolean> {
    return this.transferService.delete(user.id, input.id);
  }
}
