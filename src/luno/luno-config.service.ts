import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LUNO_DEFAULT_BASE_URL } from './luno.constants';

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
export class LunoConfigService implements OnModuleInit {
  private readonly logger = new Logger(LunoConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'Luno sync disabled. Set LUNO_API_KEY_ID and LUNO_API_KEY_SECRET, or LUNO_ENABLED=true.',
      );
      return;
    }
    if (!this.apiKeyId || !this.apiKeySecret) {
      throw new Error(
        'Luno is enabled but credentials are missing. Set LUNO_API_KEY_ID and LUNO_API_KEY_SECRET (never commit secrets).',
      );
    }
    this.logger.log('Luno sync enabled. Credentials loaded from environment.');
  }

  /**
   * On when LUNO_ENABLED=true, or when both credentials are present
   * (unless LUNO_ENABLED is explicitly false).
   */
  get enabled(): boolean {
    const flag = envFlag(this.config.get<string>('LUNO_ENABLED'));
    if (flag === false) {
      return false;
    }
    if (flag === true) {
      return true;
    }
    return Boolean(this.apiKeyId && this.apiKeySecret);
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
