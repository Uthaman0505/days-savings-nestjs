import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type {
  LunoHealthResponseDto,
  LunoSyncResponseDto,
  LunoTickerResponseDto,
} from './dto/luno-health-response.dto';
import { LunoHealthService } from './luno-health.service';
import { LunoApiService } from './luno-api.service';
import { LunoSyncService } from './luno-sync.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';

@Controller('luno')
export class LunoController {
  constructor(
    private readonly health: LunoHealthService,
    private readonly sync: LunoSyncService,
    private readonly api: LunoApiService,
    private readonly accounting: LunoBtcAccountingService,
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
}
