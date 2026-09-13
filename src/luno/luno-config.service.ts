import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LUNO_DEFAULT_BASE_URL } from './luno.constants';

@Injectable()
export class LunoConfigService implements OnModuleInit {
  private readonly logger = new Logger(LunoConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Luno sync disabled (LUNO_ENABLED is not true).');
      return;
    }
    if (!this.apiKeyId || !this.apiKeySecret) {
      throw new Error(
        'Luno is enabled but credentials are missing. Set LUNO_API_KEY_ID and LUNO_API_KEY_SECRET (never commit secrets).',
      );
    }
    this.logger.log('Luno sync enabled. Credentials loaded from environment.');
  }

  get enabled(): boolean {
    return this.config.get<string>('LUNO_ENABLED') === 'true';
  }

  get apiKeyId(): string | null {
    return this.config.get<string>('LUNO_API_KEY_ID')?.trim() || null;
  }

  get apiKeySecret(): string | null {
    return this.config.get<string>('LUNO_API_KEY_SECRET')?.trim() || null;
  }

  get baseUrl(): string {
    const raw =
      this.config.get<string>('LUNO_API_BASE_URL')?.trim() ||
      LUNO_DEFAULT_BASE_URL;
    return raw.replace(/\/$/, '');
  }

  basicAuthHeader(): string {
    if (!this.apiKeyId || !this.apiKeySecret) {
      throw new Error('Luno credentials are not configured.');
    }
    const token = Buffer.from(
      `${this.apiKeyId}:${this.apiKeySecret}`,
      'utf8',
    ).toString('base64');
    return `Basic ${token}`;
  }
}
