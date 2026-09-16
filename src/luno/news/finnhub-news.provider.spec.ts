import { FinnhubNewsProvider } from './finnhub-news.provider';

describe('FinnhubNewsProvider', () => {
  it('maps crypto news and economic calendar rows without storing article bodies', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('/news?category=crypto')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              category: 'crypto',
              datetime: 1_758_024_000,
              headline: 'New digital-asset regulation was announced',
              id: 11,
              source: 'Reuters',
              summary: 'A short provider summary.',
              url: 'https://www.reuters.com/markets/regulation',
            },
          ],
        } as Response;
      }
      if (url.includes('/news?category=general')) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          economicCalendar: [
            {
              country: 'US',
              event: 'CPI',
              impact: 'high',
              time: '2026-09-16 20:00:00',
              estimate: 0.2,
              prev: 0.3,
            },
          ],
        }),
      } as Response;
    });
    const provider = new FinnhubNewsProvider(
      'secret-token',
      'https://finnhub.io/api/v1',
      fetchImpl,
    );
    const news = await provider.fetchLatestNews();
    expect(news).toHaveLength(1);
    expect(news[0].sourceName).toBe('Reuters');
    expect(news[0].headline).toContain('regulation');
    expect(news[0].summary).toBe('A short provider summary.');
    const events = await provider.fetchEconomicEvents(
      new Date('2026-09-16T12:00:00.000Z'),
    );
    expect(events[0].eventName).toBe('CPI');
    expect(events[0].importance).toBe('HIGH');
    expect(JSON.stringify(news)).not.toContain('secret-token');
  });

  it('retries once after HTTP 429', async () => {
    let calls = 0;
    const fetchImpl = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 429, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    const provider = new FinnhubNewsProvider(
      'token',
      'https://finnhub.io/api/v1',
      fetchImpl,
    );
    await expect(provider.fetchLatestNews()).resolves.toEqual([]);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('keeps crypto news when the economic calendar is forbidden', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('/calendar/economic')) {
        return { ok: false, status: 403, json: async () => ({}) } as Response;
      }
      if (url.includes('/news?category=crypto')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              datetime: 1_758_024_000,
              headline: 'Bitcoin network activity stays steady',
              id: 12,
              source: 'Reuters',
              summary: 'Ordinary bitcoin commentary.',
            },
          ],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    const provider = new FinnhubNewsProvider(
      'token',
      'https://finnhub.io/api/v1',
      fetchImpl,
    );
    const news = await provider.fetchLatestNews();
    expect(news).toHaveLength(1);
    await expect(
      provider.fetchEconomicEvents(new Date('2026-09-16T12:00:00.000Z')),
    ).resolves.toEqual([]);
  });
});
