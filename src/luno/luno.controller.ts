import {
  Body,
  Controller,
  Get,
  Logger,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { JwtUser } from '../auth/jwt.strategy';
import type {
  LunoHealthResponseDto,
  LunoSyncResponseDto,
  LunoTickerResponseDto,
} from './dto/luno-health-response.dto';
import {
  AllocateLunoBtcMoneyBucketDto,
  UpsertLunoBtcBudgetDto,
} from './dto/luno-btc-budget.dto';
import { LunoHealthService } from './luno-health.service';
import { LunoApiService } from './luno-api.service';
import { LunoSyncService, measureSyncStage } from './luno-sync.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';
import { LunoBtcDecisionService } from './luno-btc-decision.service';
import { LunoBtcMarketService } from './luno-btc-market.service';
import { LunoBtcExternalRiskService } from './luno-btc-external-risk.service';

type AuthedRequest = Request & { user?: JwtUser };

function requireUserId(req: AuthedRequest): string {
  if (!req.user?.id) {
    throw new UnauthorizedException();
  }
  return req.user.id;
}

@Controller('luno')
export class LunoController {
  private readonly syncLogger = new Logger('LunoSync');

  constructor(
    private readonly health: LunoHealthService,
    private readonly sync: LunoSyncService,
    private readonly api: LunoApiService,
    private readonly accounting: LunoBtcAccountingService,
    private readonly budget: LunoBtcBudgetService,
    private readonly decision: LunoBtcDecisionService,
    private readonly market: LunoBtcMarketService,
    private readonly externalRisk: LunoBtcExternalRiskService,
  ) {}

  @Get('ticker')
  async ticker(): Promise<LunoTickerResponseDto> {
    const market = await this.api.getBtcMyrMarketPrice();
    return {
      pair: market.pair,
      lastTrade: market.last_trade,
      bid: market.bid,
      ask: market.ask,
      timestamp: market.timestamp,
    };
  }

  @Get('health')
  @UseGuards(AuthGuard('jwt'))
  healthCheck(): Promise<LunoHealthResponseDto> {
    return this.health.getHealth();
  }

  @Post('sync')
  @UseGuards(AuthGuard('jwt'))
  async syncNow(@Req() req: AuthedRequest): Promise<LunoSyncResponseDto> {
    const userId = requireUserId(req);
    const started = Date.now();
    const lunoTimed = await measureSyncStage(this.syncLogger, 'lunoMs', () =>
      this.sync.runSync(),
    );
    const result = lunoTimed.value;
    let accountingUpdated = false;
    let decisionUpdated = false;
    let accountingMs = 0;
    let decisionMs = 0;
    try {
      const accountingTimed = await measureSyncStage(
        this.syncLogger,
        'accountingMs',
        () => this.accounting.rebuildBtcAccounting(),
      );
      accountingMs = accountingTimed.ms;
      accountingUpdated = true;
    } catch (error) {
      this.syncLogger.warn(
        `Accounting rebuild skipped: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    if (accountingUpdated) {
      try {
        const decisionTimed = await measureSyncStage(
          this.syncLogger,
          'decisionMs',
          () => this.decision.recalculateCurrentBtcDecision(userId),
        );
        decisionMs = decisionTimed.ms;
        decisionUpdated = true;
        try {
          await this.externalRisk.composeFromCachedDecision(
            decisionTimed.value,
          );
        } catch (error) {
          this.syncLogger.warn(
            `Cached Phase 5/6 compose skipped: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      } catch (error) {
        this.syncLogger.warn(
          `Decision refresh skipped: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
    const total = Date.now() - started;
    this.syncLogger.log(
      JSON.stringify({
        event: 'LUNO_SYNC',
        stage: 'totalMs',
        ms: total,
        lunoMs: lunoTimed.ms,
        accountingMs,
        decisionMs,
        marketContextSource: 'CACHED',
        externalRiskSource: 'CACHED',
      }),
    );
    result.sync = {
      lunoDataUpdated:
        result.accountsUpserted +
          result.transactionsUpserted +
          result.ordersUpserted +
          result.withdrawalsUpserted +
          result.transfersUpserted >
        0,
      accountingUpdated,
      decisionUpdated,
      marketContextSource: 'CACHED',
      externalRiskSource: 'CACHED',
    };
    if (process.env.NODE_ENV === 'development') {
      result.timingMs = {
        luno: lunoTimed.ms,
        accounting: accountingMs,
        decision: decisionMs,
        total,
      };
    }
    return result;
  }

  @Get('btc/portfolio')
  @UseGuards(AuthGuard('jwt'))
  async btcPortfolio() {
    const view = await this.accounting.getPortfolio();
    return this.accounting.toUserPortfolio(view);
  }

  @Get('btc/accounting-details')
  @UseGuards(AuthGuard('jwt'))
  btcAccountingDetails() {
    return this.accounting.getAccountingDetails();
  }

  @Post('btc/rebuild-accounting')
  @UseGuards(AuthGuard('jwt'))
  async rebuildAccounting() {
    const details = await this.accounting.rebuildBtcAccounting();
    return this.accounting.toUserPortfolio(details.portfolio);
  }

  @Get('btc/budget/current')
  @UseGuards(AuthGuard('jwt'))
  getCurrentBudget(@Req() req: AuthedRequest) {
    return this.budget.getCurrentBudget(requireUserId(req));
  }

  @Post('btc/budget/current')
  @UseGuards(AuthGuard('jwt'))
  createCurrentBudget(
    @Req() req: AuthedRequest,
    @Body() body: UpsertLunoBtcBudgetDto,
  ) {
    return this.budget.upsertCurrentBudget(requireUserId(req), body);
  }

  @Patch('btc/budget/current')
  @UseGuards(AuthGuard('jwt'))
  updateCurrentBudget(
    @Req() req: AuthedRequest,
    @Body() body: UpsertLunoBtcBudgetDto,
  ) {
    return this.budget.upsertCurrentBudget(requireUserId(req), body);
  }

  @Get('btc/budget/history')
  @UseGuards(AuthGuard('jwt'))
  getBudgetHistory(@Req() req: AuthedRequest) {
    return this.budget.getBudgetHistory(requireUserId(req));
  }

  @Get('btc/money-buckets')
  @UseGuards(AuthGuard('jwt'))
  getMoneyBuckets(@Req() req: AuthedRequest) {
    return this.budget.getMoneyBuckets(requireUserId(req));
  }

  @Post('btc/money-buckets/allocate')
  @UseGuards(AuthGuard('jwt'))
  allocateMoneyBucket(
    @Req() req: AuthedRequest,
    @Body() body: AllocateLunoBtcMoneyBucketDto,
  ) {
    return this.budget.allocateMoneyBucket(requireUserId(req), body);
  }

  @Get('btc/strategy-context')
  @UseGuards(AuthGuard('jwt'))
  getStrategyContext(@Req() req: AuthedRequest) {
    return this.budget.getStrategyContext(requireUserId(req));
  }

  @Get('btc/decision/current')
  @UseGuards(AuthGuard('jwt'))
  getCurrentDecision(@Req() req: AuthedRequest) {
    return this.decision.getCurrentDecision(requireUserId(req));
  }

  @Get('btc/decision/history')
  @UseGuards(AuthGuard('jwt'))
  getDecisionHistory(@Req() req: AuthedRequest) {
    return this.decision.getDecisionHistory(requireUserId(req));
  }

  @Post('btc/decision/recalculate')
  @UseGuards(AuthGuard('jwt'))
  recalculateDecision(@Req() req: AuthedRequest) {
    return this.decision.recalculateCurrentBtcDecision(requireUserId(req));
  }

  @Get('btc/market-context')
  @UseGuards(AuthGuard('jwt'))
  getMarketContext(@Req() req: AuthedRequest) {
    return this.market.getMarketContext(requireUserId(req));
  }

  @Get('btc/decision/final')
  @UseGuards(AuthGuard('jwt'))
  getFinalDecision(@Req() req: AuthedRequest) {
    return this.externalRisk.getFinalDecision(requireUserId(req));
  }

  @Get('btc/external-risk')
  @UseGuards(AuthGuard('jwt'))
  getExternalRisk() {
    return this.externalRisk.getExternalRisk();
  }

  @Get('btc/external-risk/events')
  @UseGuards(AuthGuard('jwt'))
  getExternalRiskEvents() {
    return this.externalRisk.getExternalRiskEvents();
  }

  @Post('btc/external-risk/sync')
  @UseGuards(AuthGuard('jwt'))
  syncExternalRisk() {
    return this.externalRisk.syncExternalRisk();
  }

  @Post('btc/external-risk/recalculate')
  @UseGuards(AuthGuard('jwt'))
  recalculateExternalRisk() {
    return this.externalRisk.recalculateExternalRisk();
  }

  @Post('btc/market-context/recalculate')
  @UseGuards(AuthGuard('jwt'))
  recalculateMarketContext() {
    return this.market.calculateBtcMarketSnapshot();
  }

  @Post('btc/market-data/sync')
  @UseGuards(AuthGuard('jwt'))
  syncMarketData() {
    return this.market.syncBtcMarketData();
  }
}
