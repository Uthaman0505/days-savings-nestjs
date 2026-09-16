import { ConfigService } from '@nestjs/config';
import { LunoNewsConfigService } from './luno-news-config.service';

function config(env: Record<string, string>): LunoNewsConfigService {
  return new LunoNewsConfigService({
    get: (key: string) => env[key],
  } as ConfigService);
}

describe('LunoNewsConfigService', () => {
  it('stays disabled when no API key is set', () => {
    const service = config({ NEWS_PROVIDER: 'FINNHUB' });
    expect(service.newsProviderName).toBe('NONE');
    expect(service.economicProviderName).toBe('NONE');
    expect(service.enabled).toBe(false);
  });

  it('enables Finnhub from NEWS_API_KEY and reuses it for the calendar', () => {
    const service = config({
      NEWS_PROVIDER: 'FINNHUB',
      NEWS_API_KEY: 'token',
      ECONOMIC_PROVIDER: 'FINNHUB',
    });
    expect(service.newsProviderName).toBe('FINNHUB');
    expect(service.economicProviderName).toBe('FINNHUB');
    expect(service.economicApiKey).toBe('token');
    expect(service.enabled).toBe(true);
  });

  it('accepts the FINHUB spelling as Finnhub', () => {
    const service = config({
      NEWS_PROVIDER: 'FINHUB',
      NEWS_API_KEY: 'token',
      ECONOMIC_PROVIDER: 'FinHub',
    });
    expect(service.newsProviderName).toBe('FINNHUB');
    expect(service.economicProviderName).toBe('FINNHUB');
  });

  it('reads a 24-hour lookahead by default', () => {
    expect(config({}).lookaheadHours).toBe(24);
    expect(config({ EXTERNAL_RISK_LOOKAHEAD_HOURS: '12' }).lookaheadHours).toBe(
      12,
    );
  });
});
