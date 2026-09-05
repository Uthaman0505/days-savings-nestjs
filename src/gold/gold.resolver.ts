import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { GoldPriceAnalyticsInput } from './dto/gold-price-analytics.input';
import { ConfirmGoldPriceCaptureInput } from './dto/confirm-gold-price-capture.input';
import { ConfirmGoldExtractionItemInput } from './dto/confirm-gold-extraction-item.input';
import { CreateGoldPurchaseInput } from './dto/create-gold-purchase.input';
import { DeleteGoldDocumentInput } from './dto/delete-gold-document.input';
import { DeleteGoldPurchaseInput } from './dto/delete-gold-purchase.input';
import { GoldPurchaseFilterInput } from './dto/gold-purchase-filter.input';
import { RejectGoldExtractionItemInput } from './dto/reject-gold-extraction-item.input';
import { SetGoldPriceInput } from './dto/set-gold-price.input';
import { UpdateGoldPurchaseInput } from './dto/update-gold-purchase.input';
import { GoldDocumentService } from './gold-document.service';
import { GoldExtractionService } from './gold-extraction.service';
import { GoldPriceCaptureService } from './gold-price-capture.service';
import { GoldService } from './gold.service';
import { GoldDocumentModel } from './models/gold-document.model';
import { ConfirmGoldExtractionItemResultModel } from './models/confirm-gold-extraction-item.model';
import { GoldExtractionItemModel } from './models/gold-extraction-item.model';
import {
  GoldPriceAnalyticsModel,
  GoldPriceHistoryPointModel,
} from './models/gold-price-analytics.model';
import { GoldPriceCaptureModel } from './models/gold-price-capture.model';
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
    private readonly goldExtractionService: GoldExtractionService,
    private readonly goldPriceCaptureService: GoldPriceCaptureService,
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

  @Query(() => GoldPriceAnalyticsModel, { name: 'goldPriceAnalytics' })
  @UseGuards(JwtAuthGuard)
  goldPriceAnalytics(
    @CurrentUser() user: JwtUser,
    @Args('input', { type: () => GoldPriceAnalyticsInput, nullable: true })
    input?: GoldPriceAnalyticsInput,
  ): Promise<GoldPriceAnalyticsModel> {
    return this.goldService.getGoldPriceAnalytics(
      user.id,
      input ?? { range: 'D7' },
    );
  }

  @Query(() => [GoldPriceHistoryPointModel], { name: 'goldPriceHistory' })
  @UseGuards(JwtAuthGuard)
  async goldPriceHistory(
    @CurrentUser() user: JwtUser,
    @Args('input', { type: () => GoldPriceAnalyticsInput, nullable: true })
    input?: GoldPriceAnalyticsInput,
  ) {
    const analytics = await this.goldService.getGoldPriceAnalytics(
      user.id,
      input ?? { range: 'ALL' },
    );
    return analytics.history;
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

  @Query(() => [GoldPriceModel], { name: 'myGoldPrices' })
  @UseGuards(JwtAuthGuard)
  myGoldPrices(@CurrentUser() user: JwtUser): Promise<GoldPriceModel[]> {
    return this.goldService.findMyGoldPrices(user.id);
  }

  @Query(() => [GoldPriceCaptureModel], { name: 'myGoldPriceCaptures' })
  @UseGuards(JwtAuthGuard)
  myGoldPriceCaptures(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldPriceCaptureModel[]> {
    return this.goldPriceCaptureService.findMyCaptures(user.id);
  }

  @Query(() => GoldPriceCaptureModel, { name: 'goldPriceCaptureById' })
  @UseGuards(JwtAuthGuard)
  goldPriceCaptureById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GoldPriceCaptureModel> {
    return this.goldPriceCaptureService.findCaptureById(user.id, id);
  }

  @Mutation(() => GoldPriceCaptureModel, { name: 'createGoldPriceCapture' })
  @UseGuards(JwtAuthGuard)
  createGoldPriceCapture(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldPriceCaptureModel> {
    return this.goldPriceCaptureService.createCapture(user.id);
  }

  @Mutation(() => GoldPriceCaptureModel, { name: 'confirmGoldPriceCapture' })
  @UseGuards(JwtAuthGuard)
  confirmGoldPriceCapture(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ConfirmGoldPriceCaptureInput,
  ): Promise<GoldPriceCaptureModel> {
    return this.goldPriceCaptureService.confirmCapture(user.id, input);
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

  @Mutation(() => GoldDocumentModel, { name: 'retryGoldDocumentExtraction' })
  @UseGuards(JwtAuthGuard)
  async retryGoldDocumentExtraction(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GoldDocumentModel> {
    await this.goldExtractionService.retryDocumentExtraction(user.id, id);
    return this.goldDocumentService.findDocumentById(user.id, id);
  }

  @Mutation(() => Boolean, { name: 'deleteGoldDocument' })
  @UseGuards(JwtAuthGuard)
  deleteGoldDocument(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteGoldDocumentInput,
  ): Promise<boolean> {
    return this.goldDocumentService.deleteDocument(user.id, input.id);
  }

  @Mutation(() => ConfirmGoldExtractionItemResultModel, {
    name: 'confirmGoldExtractionItem',
  })
  @UseGuards(JwtAuthGuard)
  confirmGoldExtractionItem(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ConfirmGoldExtractionItemInput,
  ): Promise<ConfirmGoldExtractionItemResultModel> {
    return this.goldExtractionService.confirmExtractionItem(user.id, input);
  }

  @Mutation(() => GoldExtractionItemModel, { name: 'rejectGoldExtractionItem' })
  @UseGuards(JwtAuthGuard)
  rejectGoldExtractionItem(
    @CurrentUser() user: JwtUser,
    @Args('input') input: RejectGoldExtractionItemInput,
  ): Promise<GoldExtractionItemModel> {
    return this.goldExtractionService.rejectExtractionItem(user.id, input);
  }
}
