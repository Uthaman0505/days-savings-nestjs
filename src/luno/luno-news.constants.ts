export const NEWS_PROVIDER_TOKEN = 'LUNO_NEWS_PROVIDER';
export const ECONOMIC_PROVIDER_TOKEN = 'LUNO_ECONOMIC_CALENDAR_PROVIDER';
export const NEWS_FETCH = 'LUNO_NEWS_FETCH';

export const FINNHUB_DEFAULT_BASE_URL = 'https://finnhub.io/api/v1';
export const NEWS_HTTP_TIMEOUT_MS = 15_000;
export const NEWS_RETRY_BACKOFF_MS = 2_000;

/** Freshness for last successful provider fetch. */
export const NEWS_FRESH_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const NEWS_STALE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Cluster republished headlines within this window. */
export const NEWS_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** High-importance macro events in this window raise caution. */
export const DEFAULT_MACRO_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

export const NEWS_RELEVANCE_MIN = 40;
export const NEWS_HIGH_RELEVANCE = 70;
export const NEWS_RECENCY_FRESH_MS = 6 * 60 * 60 * 1000;
export const NEWS_RECENCY_DAY_MS = 24 * 60 * 60 * 1000;
