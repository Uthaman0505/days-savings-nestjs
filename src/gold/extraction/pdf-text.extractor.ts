import { Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export class PdfTextExtractionError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PdfTextExtractionError';
  }
}

const logger = new Logger('PdfTextExtractor');

/**
 * Extract plain text from a digital PDF buffer.
 * Does not log extracted content.
 */
export async function extractTextFromPdfBuffer(
  buffer: Buffer,
): Promise<string> {
  if (!buffer?.length) {
    throw new PdfTextExtractionError(
      'PDF_TEXT_EXTRACTION_FAILED',
      'Empty PDF.',
    );
  }

  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text?.trim() ?? '';
    if (!text) {
      throw new PdfTextExtractionError(
        'PDF_TEXT_EXTRACTION_FAILED',
        'No extractable text.',
      );
    }
    return text;
  } catch (err) {
    if (err instanceof PdfTextExtractionError) {
      throw err;
    }
    logger.warn(
      `PDF text extraction failed: ${err instanceof Error ? err.name : 'unknown'}`,
    );
    throw new PdfTextExtractionError('PDF_TEXT_EXTRACTION_FAILED');
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }
}
