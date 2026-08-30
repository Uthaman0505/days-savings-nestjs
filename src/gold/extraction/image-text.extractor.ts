import { Injectable, Logger } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getSharedWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

@Injectable()
export class ImageTextExtractorService {
  private readonly logger = new Logger(ImageTextExtractorService.name);

  async extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
    try {
      const worker = await getSharedWorker();
      const result = await worker.recognize(buffer);
      return result.data.text ?? '';
    } catch (err) {
      this.logger.warn(
        `OCR failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      throw new Error('OCR_EXTRACTION_FAILED');
    }
  }
}
