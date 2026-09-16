import type {
  EconomicCalendarProvider,
  NewsProvider,
  ProviderEconomicItem,
  ProviderNewsItem,
} from './news-provider';

export class DisabledNewsProvider
  implements NewsProvider, EconomicCalendarProvider
{
  readonly name = 'NONE' as const;

  fetchLatestNews(): Promise<ProviderNewsItem[]> {
    return Promise.resolve([]);
  }

  fetchEconomicEvents(): Promise<ProviderEconomicItem[]> {
    return Promise.resolve([]);
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
