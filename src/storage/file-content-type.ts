import { BadRequestException } from '@nestjs/common';
import {
  GOLD_DOCUMENT_ALLOWED_MIME_TYPES,
  type GoldDocumentMimeType,
} from './upload-limits';

const AVATAR_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Detect content type from magic bytes. Returns null when unrecognized.
 */
export function detectContentTypeFromBuffer(
  buffer: Buffer,
): GoldDocumentMimeType | null {
  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).toString('ascii') === '%PDF'
  ) {
    return 'application/pdf';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function extensionFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

export function validateAvatarMime(reportedMime: string): void {
  if (!AVATAR_ALLOWED_MIME_TYPES.has(reportedMime)) {
    throw new BadRequestException(
      'Unsupported image type. Allowed: jpeg, png, webp.',
    );
  }
}

/**
 * Validates gold document bytes against an allowlist and rejects MIME spoofing.
 * Returns the authoritative content type derived from magic bytes.
 */
export function validateGoldDocumentContentType(
  buffer: Buffer,
  reportedMime: string,
): GoldDocumentMimeType {
  const normalizedReported = reportedMime.trim().toLowerCase();
  if (
    !GOLD_DOCUMENT_ALLOWED_MIME_TYPES.includes(
      normalizedReported as GoldDocumentMimeType,
    )
  ) {
    throw new BadRequestException(
      'Unsupported file type. Allowed: jpeg, png, webp, pdf.',
    );
  }

  const detected = detectContentTypeFromBuffer(buffer);
  if (!detected) {
    throw new BadRequestException('Unsupported or unrecognized file content.');
  }

  if (detected !== normalizedReported) {
    throw new BadRequestException(
      'File content does not match the declared type.',
    );
  }

  return detected;
}
