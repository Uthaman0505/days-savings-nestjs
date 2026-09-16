import type { LunoBtcNewsProviderName } from '../entities/luno-btc-news-event.entity';
import type {
  LunoBtcEconomicImportance,
  LunoBtcEconomicStatus,
} from '../entities/luno-btc-economic-event.entity';

export type ProviderNewsItem = {
  externalId: string;
  provider: LunoBtcNewsProviderName;
  sourceName: string;
  sourceUrl: string | null;
  headline: string;
  summary: string | null;
  publishedAt: Date;
  countryOrRegion: string | null;
  raw: Record<string, unknown>;
};

export type ProviderEconomicItem = {
  externalId: string;
  provider: LunoBtcNewsProviderName;
  eventName: string;
  country: string | null;
  scheduledAt: Date;
  actualValue: string | null;
  forecastValue: string | null;
  previousValue: string | null;
  importance: LunoBtcEconomicImportance;
  status: LunoBtcEconomicStatus;
  sourceUrl: string | null;
};

export interface NewsProvider {
  readonly name: LunoBtcNewsProviderName;
  fetchLatestNews(now?: Date): Promise<ProviderNewsItem[]>;
  healthCheck(): Promise<boolean>;
}

export interface EconomicCalendarProvider {
  readonly name: LunoBtcNewsProviderName;
  fetchEconomicEvents(now?: Date): Promise<ProviderEconomicItem[]>;
  healthCheck(): Promise<boolean>;
}
