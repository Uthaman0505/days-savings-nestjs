import { BadRequestException } from '@nestjs/common';
import {
  detectContentTypeFromBuffer,
  validateGoldDocumentContentType,
} from './file-content-type';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

const PDF_HEADER = Buffer.from('%PDF-1.4\n', 'ascii');

const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

describe('file-content-type', () => {
  it('detects png, jpeg, pdf, and webp signatures', () => {
    expect(detectContentTypeFromBuffer(PNG_HEADER)).toBe('image/png');
    expect(detectContentTypeFromBuffer(JPEG_HEADER)).toBe('image/jpeg');
    expect(detectContentTypeFromBuffer(PDF_HEADER)).toBe('application/pdf');
    expect(detectContentTypeFromBuffer(WEBP_HEADER)).toBe('image/webp');
  });

  it('rejects unsupported bytes', () => {
    expect(detectContentTypeFromBuffer(Buffer.from('hello'))).toBeNull();
  });

  it('rejects unsupported declared mime types', () => {
    expect(() =>
      validateGoldDocumentContentType(PNG_HEADER, 'application/zip'),
    ).toThrow(BadRequestException);
  });

  it('rejects mime spoofing when declared type does not match bytes', () => {
    expect(() =>
      validateGoldDocumentContentType(PNG_HEADER, 'image/jpeg'),
    ).toThrow('File content does not match the declared type.');
  });

  it('accepts matching declared mime and bytes', () => {
    expect(validateGoldDocumentContentType(PNG_HEADER, 'image/png')).toBe(
      'image/png',
    );
  });
});
