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

@Controller('luno')
export class LunoController {
  constructor(
    private readonly health: LunoHealthService,
    private readonly sync: LunoSyncService,
    private readonly api: LunoApiService,
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
  syncNow(): Promise<LunoSyncResponseDto> {
    return this.sync.runSync();
  }
}
