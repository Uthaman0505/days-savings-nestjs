import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { GoldPriceAnalyticsInput } from './dto/gold-price-analytics.input';
import { GoldPortfolioAnalyticsInput } from './dto/gold-portfolio-analytics.input';
import { ConfirmGoldPriceCaptureInput } from './dto/confirm-gold-price-capture.input';
import { ConfirmGoldExtractionItemInput } from './dto/confirm-gold-extraction-item.input';
import { CreateGoldPurchaseInput } from './dto/create-gold-purchase.input';
import { DeleteGoldDocumentInput } from './dto/delete-gold-document.input';
import { DeleteGoldPurchaseInput } from './dto/delete-gold-purchase.input';
import { GoldPurchaseFilterInput } from './dto/gold-purchase-filter.input';
import { RejectGoldExtractionItemInput } from './dto/reject-gold-extraction-item.input';
import { SetGoldPriceInput } from './dto/set-gold-price.input';
import { SetGoldProfitGoalInput } from './dto/set-gold-profit-goal.input';
import { GoldProfitTakingPreviewInput } from './dto/gold-profit-taking-preview.input';
import { GoldNextProfitGoalPreviewInput } from './dto/gold-next-profit-goal-preview.input';
import { CreateNextGoldProfitGoalInput } from './dto/create-next-gold-profit-goal.input';
import {
  GoldFutureScenarioComparisonInput,
  GoldFutureScenarioInput,
} from './dto/gold-future-scenario.input';
import { SetGoldMonthlyBudgetInput } from './dto/set-gold-monthly-budget.input';
import { UpdateGoldPurchaseInput } from './dto/update-gold-purchase.input';
import { GoldDocumentService } from './gold-document.service';
import { GoldExtractionService } from './gold-extraction.service';
import { GoldPriceCaptureService } from './gold-price-capture.service';
import { GoldPlanningService } from './gold-planning.service';
import { GoldProfitGoalService } from './gold-profit-goal.service';
import { GoldService } from './gold.service';
import { GoldDocumentModel } from './models/gold-document.model';
import { ConfirmGoldExtractionItemResultModel } from './models/confirm-gold-extraction-item.model';
import { GoldExtractionItemModel } from './models/gold-extraction-item.model';
import {
  GoldPriceAnalyticsModel,
  GoldPriceHistoryPointModel,
} from './models/gold-price-analytics.model';
import { GoldPortfolioAnalyticsModel } from './models/gold-portfolio-analytics.model';
import { GoldProfitGoalStatusModel } from './models/gold-profit-goal.model';
import {
  GoldNextProfitGoalPreviewModel,
  GoldProfitGoalCompletionModel,
  GoldProfitGoalHistoryItemModel,
} from './models/gold-next-profit-goal.model';
import { GoldProfitTakingPreviewModel } from './models/gold-profit-taking-preview.model';
import {
  GoldBudgetAllocationAnalysisModel,
  GoldGoalDecisionModel,
  GoldPlanningSettingsModel,
} from './models/gold-planning.model';
import {
  GoldFutureScenarioComparisonModel,
  GoldFutureScenarioModel,
} from './models/gold-future-scenario.model';
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
    private readonly goldProfitGoalService: GoldProfitGoalService,
    private readonly goldPlanningService: GoldPlanningService,
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

  @Query(() => GoldPortfolioAnalyticsModel, { name: 'goldPortfolioAnalytics' })
  @UseGuards(JwtAuthGuard)
  goldPortfolioAnalytics(
    @CurrentUser() user: JwtUser,
    @Args('input', { type: () => GoldPortfolioAnalyticsInput, nullable: true })
    input?: GoldPortfolioAnalyticsInput,
  ): Promise<GoldPortfolioAnalyticsModel> {
    return this.goldService.getGoldPortfolioAnalytics(
      user.id,
      input ?? { range: 'D7' },
    );
  }

  @Query(() => GoldProfitGoalStatusModel, {
    name: 'goldProfitGoal',
    nullable: true,
  })
  @UseGuards(JwtAuthGuard)
  goldProfitGoal(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldProfitGoalStatusModel | null> {
    return this.goldProfitGoalService.getGoldProfitGoal(user.id);
  }

  @Mutation(() => GoldProfitGoalStatusModel, { name: 'setGoldProfitGoal' })
  @UseGuards(JwtAuthGuard)
  setGoldProfitGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: SetGoldProfitGoalInput,
  ): Promise<GoldProfitGoalStatusModel> {
    return this.goldProfitGoalService.setGoldProfitGoal(user.id, input);
  }

  @Mutation(() => Boolean, { name: 'cancelGoldProfitGoal' })
  @UseGuards(JwtAuthGuard)
  cancelGoldProfitGoal(@CurrentUser() user: JwtUser): Promise<boolean> {
    return this.goldProfitGoalService.cancelGoldProfitGoal(user.id);
  }

  @Query(() => GoldProfitTakingPreviewModel, {
    name: 'goldProfitTakingPreview',
  })
  @UseGuards(JwtAuthGuard)
  goldProfitTakingPreview(
    @CurrentUser() user: JwtUser,
    @Args('input') input: GoldProfitTakingPreviewInput,
  ): Promise<GoldProfitTakingPreviewModel> {
    return this.goldProfitGoalService.getGoldProfitTakingPreview(
      user.id,
      input,
    );
  }

  @Mutation(() => GoldProfitGoalCompletionModel, {
    name: 'completeGoldProfitGoal',
  })
  @UseGuards(JwtAuthGuard)
  completeGoldProfitGoal(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldProfitGoalCompletionModel> {
    return this.goldProfitGoalService.completeGoldProfitGoal(user.id);
  }

  @Query(() => [GoldProfitGoalHistoryItemModel], {
    name: 'goldProfitGoalHistory',
  })
  @UseGuards(JwtAuthGuard)
  goldProfitGoalHistory(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldProfitGoalHistoryItemModel[]> {
    return this.goldProfitGoalService.getGoldProfitGoalHistory(user.id);
  }

  @Query(() => GoldNextProfitGoalPreviewModel, {
    name: 'goldNextProfitGoalPreview',
  })
  @UseGuards(JwtAuthGuard)
  goldNextProfitGoalPreview(
    @CurrentUser() user: JwtUser,
    @Args('input') input: GoldNextProfitGoalPreviewInput,
  ): Promise<GoldNextProfitGoalPreviewModel> {
    return this.goldProfitGoalService.getGoldNextProfitGoalPreview(
      user.id,
      input,
    );
  }

  @Query(() => GoldPlanningSettingsModel, {
    name: 'goldPlanningSettings',
    nullable: true,
  })
  @UseGuards(JwtAuthGuard)
  goldPlanningSettings(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldPlanningSettingsModel | null> {
    return this.goldPlanningService.getGoldPlanningSettings(user.id);
  }

  @Mutation(() => GoldPlanningSettingsModel, { name: 'setGoldMonthlyBudget' })
  @UseGuards(JwtAuthGuard)
  setGoldMonthlyBudget(
    @CurrentUser() user: JwtUser,
    @Args('input') input: SetGoldMonthlyBudgetInput,
  ): Promise<GoldPlanningSettingsModel> {
    return this.goldPlanningService.setGoldMonthlyBudget(user.id, input);
  }

  @Query(() => GoldGoalDecisionModel, { name: 'goldGoalDecision' })
  @UseGuards(JwtAuthGuard)
  goldGoalDecision(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldGoalDecisionModel> {
    return this.goldPlanningService.getGoldGoalDecision(user.id);
  }

  @Query(() => GoldBudgetAllocationAnalysisModel, {
    name: 'goldBudgetAllocationAnalysis',
  })
  @UseGuards(JwtAuthGuard)
  goldBudgetAllocationAnalysis(
    @CurrentUser() user: JwtUser,
  ): Promise<GoldBudgetAllocationAnalysisModel> {
    return this.goldPlanningService.getGoldBudgetAllocationAnalysis(user.id);
  }

  @Query(() => GoldFutureScenarioModel, { name: 'goldFutureScenario' })
  @UseGuards(JwtAuthGuard)
  goldFutureScenario(
    @CurrentUser() user: JwtUser,
    @Args('input') input: GoldFutureScenarioInput,
  ): Promise<GoldFutureScenarioModel> {
    return this.goldPlanningService.getGoldFutureScenario(user.id, input);
  }

  @Query(() => GoldFutureScenarioComparisonModel, {
    name: 'goldFutureScenarioComparison',
  })
  @UseGuards(JwtAuthGuard)
  goldFutureScenarioComparison(
    @CurrentUser() user: JwtUser,
    @Args('input') input: GoldFutureScenarioComparisonInput,
  ): Promise<GoldFutureScenarioComparisonModel> {
    return this.goldPlanningService.getGoldFutureScenarioComparison(
      user.id,
      input,
    );
  }

  @Mutation(() => GoldProfitGoalStatusModel, {
    name: 'createNextGoldProfitGoal',
  })
  @UseGuards(JwtAuthGuard)
  createNextGoldProfitGoal(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateNextGoldProfitGoalInput,
  ): Promise<GoldProfitGoalStatusModel> {
    return this.goldProfitGoalService.createNextGoldProfitGoal(user.id, input);
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
