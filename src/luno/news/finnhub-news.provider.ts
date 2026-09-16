import { Logger } from '@nestjs/common';
import {
  FINNHUB_DEFAULT_BASE_URL,
  NEWS_HTTP_TIMEOUT_MS,
  NEWS_RETRY_BACKOFF_MS,
} from '../luno-news.constants';
import type {
  EconomicCalendarProvider,
  NewsProvider,
  ProviderEconomicItem,
  ProviderNewsItem,
} from './news-provider';
import type { LunoBtcEconomicImportance } from '../entities/luno-btc-economic-event.entity';

export type NewsFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

type FinnhubNewsRow = {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number | string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

type FinnhubEconomicRow = {
  actual?: number | string | null;
  country?: string;
  estimate?: number | string | null;
  event?: string;
  impact?: string;
  prev?: number | string | null;
  time?: string;
  unit?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class FinnhubNewsProvider
  implements NewsProvider, EconomicCalendarProvider
{
  readonly name = 'FINNHUB' as const;
  private readonly logger = new Logger(FinnhubNewsProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = FINNHUB_DEFAULT_BASE_URL,
    private readonly fetchImpl: NewsFetch = fetch,
  ) {}

  async fetchLatestNews(): Promise<ProviderNewsItem[]> {
    const [crypto, general] = await Promise.all([
      this.getJson<FinnhubNewsRow[]>('/news?category=crypto'),
      this.getJson<FinnhubNewsRow[]>('/news?category=general'),
    ]);
    const rows = [
      ...(Array.isArray(crypto) ? crypto : []),
      ...(Array.isArray(general) ? general : []),
    ];
    const seen = new Set<string>();
    const items: ProviderNewsItem[] = [];
    for (const row of rows) {
      const item = this.toNewsItem(row);
      if (!item || seen.has(item.externalId)) {
        continue;
      }
      seen.add(item.externalId);
      items.push(item);
    }
    return items;
  }

  async fetchEconomicEvents(now = new Date()): Promise<ProviderEconomicItem[]> {
    const from = isoDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const to = isoDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    const raw = await this.getJson<{ economicCalendar?: FinnhubEconomicRow[] }>(
      `/calendar/economic?from=${from}&to=${to}`,
    );
    const rows = Array.isArray(raw?.economicCalendar)
      ? raw.economicCalendar
      : [];
    return rows
      .map((row) => this.toEconomicItem(row))
      .filter((row): row is ProviderEconomicItem => row != null);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getJson<unknown>('/news?category=crypto');
      return true;
    } catch {
      return false;
    }
  }

  private toNewsItem(row: FinnhubNewsRow): ProviderNewsItem | null {
    const headline = asText(row.headline);
    if (!headline) {
      return null;
    }
    const publishedAt = new Date(Number(row.datetime || 0) * 1000);
    if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() <= 0) {
      return null;
    }
    const externalId =
      asText(row.id) ?? `${asText(row.url) ?? headline}:${row.datetime}`;
    return {
      externalId: externalId.slice(0, 128),
      provider: 'FINNHUB',
      sourceName: asText(row.source) ?? 'Finnhub',
      sourceUrl: asText(row.url),
      headline: headline.slice(0, 512),
      summary: asText(row.summary)?.slice(0, 2000) ?? null,
      publishedAt,
      countryOrRegion: null,
      raw: {
        category: row.category ?? null,
        related: row.related ?? null,
        id: row.id ?? null,
      },
    };
  }

  private toEconomicItem(row: FinnhubEconomicRow): ProviderEconomicItem | null {
    const eventName = asText(row.event);
    const scheduledAt = parseFinnhubTime(row.time);
    if (!eventName || !scheduledAt) {
      return null;
    }
    const country = asText(row.country);
    const externalId = `${country ?? 'XX'}:${eventName}:${row.time}`.slice(
      0,
      128,
    );
    return {
      externalId,
      provider: 'FINNHUB',
      eventName: eventName.slice(0, 256),
      country,
      scheduledAt,
      actualValue: asText(row.actual),
      forecastValue: asText(row.estimate),
      previousValue: asText(row.prev),
      importance: mapImpact(row.impact),
      status: asText(row.actual) ? 'RELEASED' : 'SCHEDULED',
      sourceUrl: null,
    };
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.apiKey)}`;
    return this.getJsonOnce<T>(url, true);
  }

  private async getJsonOnce<T>(
    url: string,
    retryOnRateLimit: boolean,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(NEWS_HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `Finnhub request failed: ${error instanceof Error ? error.message : 'network'}`,
      );
      throw error;
    }
    if (response.status === 429 && retryOnRateLimit) {
      await sleep(NEWS_RETRY_BACKOFF_MS);
      return this.getJsonOnce<T>(url, false);
    }
    if (!response.ok) {
      throw new Error(`Finnhub HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

function mapImpact(value: string | undefined): LunoBtcEconomicImportance {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'high') {
    return 'HIGH';
  }
  if (normalized === 'medium' || normalized === 'med') {
    return 'MEDIUM';
  }
  return 'LOW';
}

function parseFinnhubTime(value: string | undefined): Date | null {
  const raw = asText(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}
