import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LunoBtcEconomicEvent } from './entities/luno-btc-economic-event.entity';
import { LunoBtcNewsEvent } from './entities/luno-btc-news-event.entity';
import { LunoBtcNewsRiskSnapshot } from './entities/luno-btc-news-risk-snapshot.entity';
import { LunoBtcExternalRiskService } from './luno-btc-external-risk.service';
import { LunoBtcMarketService } from './luno-btc-market.service';
import { LunoNewsConfigService } from './luno-news-config.service';
import {
  ECONOMIC_PROVIDER_TOKEN,
  NEWS_PROVIDER_TOKEN,
} from './luno-news.constants';
import { DisabledNewsProvider } from './news/disabled-news.provider';

describe('LunoBtcExternalRiskService', () => {
  it('keeps Phase 5 WAIT when providers are unavailable', async () => {
    const module = await Test.createTestingModule({
      providers: [
        LunoBtcExternalRiskService,
        {
          provide: getRepositoryToken(LunoBtcNewsEvent),
          useValue: {
            find: jest.fn(async () => []),
            findOne: jest.fn(async () => null),
            create: jest.fn((row) => row),
            save: jest.fn(async (row) => row),
          },
        },
        {
          provide: getRepositoryToken(LunoBtcEconomicEvent),
          useValue: {
            find: jest.fn(async () => []),
            findOne: jest.fn(async () => null),
            create: jest.fn((row) => row),
            save: jest.fn(async (row) => row),
          },
        },
        {
          provide: getRepositoryToken(LunoBtcNewsRiskSnapshot),
          useValue: {
            find: jest.fn(async () => []),
            create: jest.fn((row) => row),
            save: jest.fn(async (row) => row),
          },
        },
        { provide: NEWS_PROVIDER_TOKEN, useValue: new DisabledNewsProvider() },
        {
          provide: ECONOMIC_PROVIDER_TOKEN,
          useValue: new DisabledNewsProvider(),
        },
        {
          provide: LunoNewsConfigService,
          useValue: { lookaheadHours: 24 },
        },
        {
          provide: LunoBtcMarketService,
          useValue: {
            getLatestBtcMarketSnapshot: jest.fn(async () => null),
            getFinalDecision: jest.fn(async () => ({
              baseDecision: {
                action: 'WAIT',
                displayAction: 'WAIT',
                suggestedAmountMyr: null,
              },
              marketContext: null,
              finalDecision: {
                action: 'WAIT',
                displayAction: 'WAIT',
                suggestedAmountMyr: null,
                monthlyRemainingMyr: '50.00',
                maxAllowedNewSpendMyr: '50.00',
                monthlyBudgetMyr: '100.00',
                monthlyUsedMyr: '50.00',
                reason: ['Price is not in a buy zone.'],
                modifiedByMarketContext: false,
              },
            })),
          },
        },
      ],
    }).compile();
    const service = module.get(LunoBtcExternalRiskService);
    const combined = await service.getFinalDecision('user-1');
    expect(combined.finalDecision.action).toBe('WAIT');
    expect(combined.finalDecision.modifiedByExternalRisk).toBe(false);
    expect(combined.externalRisk.status).toBe('UNAVAILABLE');
    expect(combined.externalRisk.reasons[0]).toMatch(/unavailable/i);
  });

  it('still stores news when the economic calendar provider fails', async () => {
    const newsSave = jest.fn(async (row) => row);
    const snapshotSave = jest.fn(async (row) => row);
    const module = await Test.createTestingModule({
      providers: [
        LunoBtcExternalRiskService,
        {
          provide: getRepositoryToken(LunoBtcNewsEvent),
          useValue: {
            find: jest.fn(async () => []),
            findOne: jest.fn(async () => null),
            create: jest.fn((row) => row),
            save: newsSave,
          },
        },
        {
          provide: getRepositoryToken(LunoBtcEconomicEvent),
          useValue: {
            find: jest.fn(async () => []),
            findOne: jest.fn(async () => null),
            create: jest.fn((row) => row),
            save: jest.fn(async (row) => row),
          },
        },
        {
          provide: getRepositoryToken(LunoBtcNewsRiskSnapshot),
          useValue: {
            find: jest.fn(async () => []),
            create: jest.fn((row) => row),
            save: snapshotSave,
          },
        },
        {
          provide: NEWS_PROVIDER_TOKEN,
          useValue: {
            name: 'FINNHUB',
            fetchLatestNews: async () => [
              {
                externalId: '1',
                provider: 'FINNHUB',
                sourceName: 'Reuters',
                sourceUrl: 'https://www.reuters.com/example',
                headline: 'New digital-asset regulation was announced',
                summary: 'A short provider summary.',
                publishedAt: new Date('2026-09-16T12:00:00.000Z'),
                countryOrRegion: 'US',
                raw: {},
              },
            ],
            healthCheck: async () => true,
          },
        },
        {
          provide: ECONOMIC_PROVIDER_TOKEN,
          useValue: {
            name: 'FINNHUB',
            fetchEconomicEvents: async () => {
              throw new Error('Finnhub HTTP 403');
            },
            healthCheck: async () => false,
          },
        },
        {
          provide: LunoNewsConfigService,
          useValue: { lookaheadHours: 24 },
        },
        {
          provide: LunoBtcMarketService,
          useValue: {
            getLatestBtcMarketSnapshot: jest.fn(async () => null),
          },
        },
      ],
    }).compile();
    const service = module.get(LunoBtcExternalRiskService);
    const synced = await service.syncExternalRisk();
    expect(synced.news).toBe(1);
    expect(synced.economic).toBe(0);
    expect(newsSave).toHaveBeenCalled();
    await service.recalculateExternalRisk(new Date('2026-09-16T12:05:00.000Z'));
    expect(snapshotSave).toHaveBeenCalled();
    expect(snapshotSave.mock.calls[0][0].newsDataStatus).not.toBe(
      'UNAVAILABLE',
    );
  });
});
