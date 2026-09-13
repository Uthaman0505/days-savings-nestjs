import { HttpException, HttpStatus } from '@nestjs/common';
import { redactSecrets } from './luno-redact';

export type LunoErrorCode =
  | 'NOT_ENABLED'
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'MALFORMED'
  | 'NETWORK'
  | 'UNKNOWN';

export class LunoApiException extends HttpException {
  readonly lunoCode: LunoErrorCode;

  constructor(
    lunoCode: LunoErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_GATEWAY,
  ) {
    super(
      {
        statusCode: status,
        code: lunoCode,
        message: redactSecrets(message),
      },
      status,
    );
    this.lunoCode = lunoCode;
  }
}

export function mapLunoHttpError(
  status: number,
  bodyText: string,
): LunoApiException {
  const safe = redactSecrets(bodyText).slice(0, 400);
  if (status === 401) {
    return new LunoApiException(
      'UNAUTHORIZED',
      'Luno rejected the API key (invalid or revoked).',
      HttpStatus.BAD_GATEWAY,
    );
  }
  if (status === 403) {
    return new LunoApiException(
      'FORBIDDEN',
      'Luno API key is missing a required read permission.',
      HttpStatus.BAD_GATEWAY,
    );
  }
  if (status === 429) {
    return new LunoApiException(
      'RATE_LIMITED',
      'Luno rate limit reached. Retry later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  return new LunoApiException(
    'UNKNOWN',
    `Luno HTTP ${status}: ${safe || 'empty body'}`,
  );
}
