-- Gold document soft-delete (restore-on-reupload support)
-- Apply manually when TYPEORM_SYNC=false.

ALTER TABLE gold_documents
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_gold_documents_user_active
  ON gold_documents (user_id, is_active);
