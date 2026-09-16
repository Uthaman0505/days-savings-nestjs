-- Phase 6 external news/economy risk. Read-only providers. No Luno orders.
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS luno_btc_news_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  source_name VARCHAR(128) NOT NULL,
  source_url VARCHAR(1024) NULL,
  headline VARCHAR(512) NOT NULL,
  summary TEXT NULL,
  normalized_headline VARCHAR(512) NOT NULL,
  category VARCHAR(32) NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  relevance_score NUMERIC(28, 18) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  sentiment_direction VARCHAR(16) NOT NULL,
  btc_specific BOOLEAN NOT NULL DEFAULT FALSE,
  macro_specific BOOLEAN NOT NULL DEFAULT FALSE,
  country_or_region VARCHAR(64) NULL,
  raw_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_btc_news_events UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_news_events_published
  ON luno_btc_news_events (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_luno_btc_news_events_provider
  ON luno_btc_news_events (provider);
CREATE INDEX IF NOT EXISTS idx_luno_btc_news_events_category
  ON luno_btc_news_events (category);
CREATE INDEX IF NOT EXISTS idx_luno_btc_news_events_severity
  ON luno_btc_news_events (severity);

CREATE TABLE IF NOT EXISTS luno_btc_economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  event_name VARCHAR(256) NOT NULL,
  country VARCHAR(64) NULL,
  category VARCHAR(32) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  actual_value VARCHAR(64) NULL,
  forecast_value VARCHAR(64) NULL,
  previous_value VARCHAR(64) NULL,
  importance VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  source_url VARCHAR(1024) NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_luno_btc_economic_events UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_economic_events_scheduled
  ON luno_btc_economic_events (scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_luno_btc_economic_events_provider
  ON luno_btc_economic_events (provider);
CREATE INDEX IF NOT EXISTS idx_luno_btc_economic_events_category
  ON luno_btc_economic_events (category);

CREATE TABLE IF NOT EXISTS luno_btc_news_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculated_at TIMESTAMPTZ NOT NULL,
  risk_level VARCHAR(16) NOT NULL,
  dominant_category VARCHAR(32) NOT NULL,
  confidence VARCHAR(16) NOT NULL,
  relevant_event_count INTEGER NOT NULL DEFAULT 0,
  high_severity_event_count INTEGER NOT NULL DEFAULT 0,
  upcoming_macro_event_count INTEGER NOT NULL DEFAULT 0,
  independent_source_count INTEGER NOT NULL DEFAULT 0,
  market_reaction_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  risk_score NUMERIC(28, 18) NOT NULL,
  reason_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_health VARCHAR(16) NOT NULL,
  news_data_status VARCHAR(16) NOT NULL,
  latest_source_event_at TIMESTAMPTZ NULL,
  last_successful_fetch_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luno_btc_news_risk_snapshots_calculated
  ON luno_btc_news_risk_snapshots (calculated_at DESC);
