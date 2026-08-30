import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CreateGoldPurchaseInput } from './dto/create-gold-purchase.input';
import { DeleteGoldPurchaseInput } from './dto/delete-gold-purchase.input';
import { GoldPurchaseFilterInput } from './dto/gold-purchase-filter.input';
import { SetGoldPriceInput } from './dto/set-gold-price.input';
import { UpdateGoldPurchaseInput } from './dto/update-gold-purchase.input';
import { GoldDocumentService } from './gold-document.service';
import { GoldService } from './gold.service';
import { GoldDocumentModel } from './models/gold-document.model';
import {
  GoldDashboardModel,
  GoldPriceModel,
  GoldPurchaseModel,
} from './models/gold.model';

@Resolver()
export class GoldResolver {
  constructor(
    private readonly goldService: GoldService,
    private readonly goldDocumentService: GoldDocumentService,
  ) {}

  @Query(() => GoldDashboardModel, { name: 'goldDashboard' })
  @UseGuards(JwtAuthGuard)
  goldDashboard(@CurrentUser() user: JwtUser): Promise<GoldDashboardModel> {
    return this.goldService.getDashboard(user.id);
  }

  @Query(() => [GoldPurchaseModel], { name: 'myGoldPurchases' })
  @UseGuards(JwtAuthGuard)
  myGoldPurchases(
    @CurrentUser() user: JwtUser,
    @Args('filter', { type: () => GoldPurchaseFilterInput, nullable: true })
    filter?: GoldPurchaseFilterInput,
  ): Promise<GoldPurchaseModel[]> {
    return this.goldService.findMyPurchases(user.id, filter);
  }

  @Query(() => GoldPurchaseModel, { name: 'goldPurchaseById' })
  @UseGuards(JwtAuthGuard)
  goldPurchaseById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GoldPurchaseModel> {
    return this.goldService.findPurchaseById(user.id, id);
  }

  @Query(() => GoldPriceModel, { name: 'latestGoldPrice', nullable: true })
  @UseGuards(JwtAuthGuard)
  latestGoldPrice(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldPriceModel | null> {
    return this.goldService.latestGoldPrice(user.id);
  }

  @Mutation(() => GoldPurchaseModel, { name: 'createGoldPurchase' })
  @UseGuards(JwtAuthGuard)
  createGoldPurchase(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateGoldPurchaseInput,
  ): Promise<GoldPurchaseModel> {
    return this.goldService.createPurchase(user.id, input);
  }

  @Mutation(() => GoldPurchaseModel, { name: 'updateGoldPurchase' })
  @UseGuards(JwtAuthGuard)
  updateGoldPurchase(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateGoldPurchaseInput,
  ): Promise<GoldPurchaseModel> {
    return this.goldService.updatePurchase(user.id, id, input);
  }

  @Mutation(() => Boolean, { name: 'deleteGoldPurchase' })
  @UseGuards(JwtAuthGuard)
  deleteGoldPurchase(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteGoldPurchaseInput,
  ): Promise<boolean> {
    return this.goldService.deletePurchase(user.id, input.id);
  }

  @Mutation(() => GoldPriceModel, { name: 'setGoldPrice' })
  @UseGuards(JwtAuthGuard)
  setGoldPrice(
    @CurrentUser() user: JwtUser,
    @Args('input') input: SetGoldPriceInput,
  ): Promise<GoldPriceModel> {
    return this.goldService.setGoldPrice(user.id, input);
  }

  @Query(() => [GoldDocumentModel], { name: 'myGoldDocuments' })
  @UseGuards(JwtAuthGuard)
  myGoldDocuments(@CurrentUser() user: JwtUser): Promise<GoldDocumentModel[]> {
    return this.goldDocumentService.findMyDocuments(user.id);
  }

  @Query(() => GoldDocumentModel, { name: 'goldDocumentById' })
  @UseGuards(JwtAuthGuard)
  goldDocumentById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GoldDocumentModel> {
    return this.goldDocumentService.findDocumentById(user.id, id);
  }
}
