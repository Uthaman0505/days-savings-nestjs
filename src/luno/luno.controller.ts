import {
  Body,
  Controller,
  Get,
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
import { LunoSyncService } from './luno-sync.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoBtcBudgetService } from './luno-btc-budget.service';

type AuthedRequest = Request & { user?: JwtUser };

function requireUserId(req: AuthedRequest): string {
  if (!req.user?.id) {
    throw new UnauthorizedException();
  }
  return req.user.id;
}

@Controller('luno')
export class LunoController {
  constructor(
    private readonly health: LunoHealthService,
    private readonly sync: LunoSyncService,
    private readonly api: LunoApiService,
    private readonly accounting: LunoBtcAccountingService,
    private readonly budget: LunoBtcBudgetService,
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
  async syncNow(): Promise<LunoSyncResponseDto> {
    const result = await this.sync.runSync();
    try {
      await this.accounting.rebuildBtcAccounting();
    } catch {
      // Phase 1 sync must still succeed if derived accounting rebuild fails.
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
}
