import type { LunoHealthResult, LunoSyncResult } from '../luno.types';

export type LunoHealthResponseDto = LunoHealthResult;
export type LunoSyncResponseDto = LunoSyncResult;

export type LunoTickerResponseDto = {
  pair: string;
  lastTrade: string;
  bid: string;
  ask: string;
  timestamp: number;
};
