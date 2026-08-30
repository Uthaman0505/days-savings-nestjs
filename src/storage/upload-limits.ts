/** Avatar uploads — unchanged from ProfileMedia Phase 1 limit. */
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

/** Gold purchase document uploads (in-memory multer buffer). */
export const MAX_GOLD_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const GOLD_DOCUMENT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type GoldDocumentMimeType =
  (typeof GOLD_DOCUMENT_ALLOWED_MIME_TYPES)[number];
