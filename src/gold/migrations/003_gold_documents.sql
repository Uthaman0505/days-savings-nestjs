-- Gold document uploads (Phase 2A)
-- Apply manually when TYPEORM_SYNC=false.

CREATE TABLE IF NOT EXISTS gold_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size_bytes INT NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  extraction_status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
  extraction_error TEXT NULL,
  raw_extract JSONB NULL,
  page_count INT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_gold_documents_user_sha256 UNIQUE (user_id, sha256_hash)
);

CREATE INDEX IF NOT EXISTS idx_gold_documents_user_created_at
  ON gold_documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gold_documents_user_extraction_status
  ON gold_documents (user_id, extraction_status);
