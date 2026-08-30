-- Gold extraction candidate items (Phase 2B)
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS gold_extraction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gold_document_id UUID NOT NULL REFERENCES gold_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  purchase_date DATE NULL,
  weight_grams NUMERIC(12, 4) NULL,
  amount_paid_cents INT NULL,
  price_per_gram_cents INT NULL,
  reference_number VARCHAR(100) NULL,
  confidence NUMERIC(5, 4) NULL,
  raw_fields JSONB NULL,
  validation_warnings JSONB NULL,
  gold_purchase_id UUID NULL REFERENCES gold_purchases(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ NULL,
  rejected_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gold_extraction_items_document_row UNIQUE (gold_document_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_gold_extraction_items_user_status
  ON gold_extraction_items (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_extraction_items_gold_purchase_id
  ON gold_extraction_items (gold_purchase_id)
  WHERE gold_purchase_id IS NOT NULL;
