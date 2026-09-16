import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FINNHUB_DEFAULT_BASE_URL } from './luno-news.constants';
import type { LunoBtcNewsProviderName } from './entities/luno-btc-news-event.entity';

function envFlag(value: string | undefined | null): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return null;
}

@Injectable()
export class LunoNewsConfigService implements OnModuleInit {
  private readonly logger = new Logger(LunoNewsConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'External risk disabled. Set NEWS_API_KEY (and NEWS_PROVIDER=FINNHUB) on the backend service the app calls.',
      );
      return;
    }
    this.logger.log(
      `External risk enabled. news=${this.newsProviderName} economic=${this.economicProviderName}.`,
    );
  }

  get newsProviderName(): LunoBtcNewsProviderName {
    return this.namedProvider('NEWS_PROVIDER', this.newsApiKey);
  }

  get economicProviderName(): LunoBtcNewsProviderName {
    return this.namedProvider('ECONOMIC_PROVIDER', this.economicApiKey);
  }

  get newsApiKey(): string | null {
    return this.config.get<string>('NEWS_API_KEY')?.trim() || null;
  }

  get economicApiKey(): string | null {
    return (
      this.config.get<string>('ECONOMIC_API_KEY')?.trim() || this.newsApiKey
    );
  }

  get newsBaseUrl(): string {
    const raw =
      this.config.get<string>('NEWS_API_BASE_URL')?.trim() ||
      FINNHUB_DEFAULT_BASE_URL;
    return raw.replace(/\/$/, '');
  }

  get enabled(): boolean {
    const flag = envFlag(this.config.get<string>('NEWS_ENABLED'));
    if (flag === false) {
      return false;
    }
    return (
      this.newsProviderName !== 'NONE' || this.economicProviderName !== 'NONE'
    );
  }

  get lookaheadHours(): number {
    const raw = Number(
      this.config.get<string>('EXTERNAL_RISK_LOOKAHEAD_HOURS'),
    );
    if (Number.isFinite(raw) && raw > 0 && raw <= 72) {
      return raw;
    }
    return 24;
  }

  private namedProvider(
    key: string,
    apiKey: string | null,
  ): LunoBtcNewsProviderName {
    const raw = this.normalizeProviderName(this.config.get<string>(key));
    if (raw === 'NONE') {
      return 'NONE';
    }
    if (raw === 'FINNHUB' && apiKey) {
      return 'FINNHUB';
    }
    if (!raw && apiKey) {
      return 'FINNHUB';
    }
    return 'NONE';
  }

  private normalizeProviderName(
    value: string | undefined,
  ): LunoBtcNewsProviderName | '' {
    const raw = value?.trim().toUpperCase();
    if (!raw) {
      return '';
    }
    if (raw === 'NONE') {
      return 'NONE';
    }
    if (raw === 'FINNHUB' || raw === 'FINHUB') {
      return 'FINNHUB';
    }
    return 'NONE';
  }
}
