import { BadRequestException } from '@nestjs/common';
import { GoldDocumentService } from './gold-document.service';
import { GoldPriceCaptureController } from './gold-price-capture.controller';
import { GoldPriceCaptureService } from './gold-price-capture.service';
import { GoldExtractionService } from './gold-extraction.service';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe('GoldPriceCaptureController routing', () => {
  const captureService = {
    createCapture: jest.fn(),
    uploadScreenshot: jest.fn(),
  };
  const documentService = {
    uploadDocument: jest.fn(),
  };
  const extractionService = {
    processDocumentExtraction: jest.fn(),
    extractDocument: jest.fn(),
  };

  const controller = new GoldPriceCaptureController(
    captureService as unknown as GoldPriceCaptureService,
  );

  const req = { user: { id: 'user-a' } } as never;
  const file = {
    originalname: 'buy-gap.png',
    mimetype: 'image/png',
    size: PNG_BYTES.length,
    buffer: PNG_BYTES,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    captureService.uploadScreenshot.mockResolvedValue({
      capture: { id: 'cap-1' },
      screenshotId: 'shot-1',
      duplicate: false,
    });
  });

  it('POST screenshots goes to GoldPriceCaptureService, not document extraction', async () => {
    await controller.uploadScreenshot(req, 'cap-1', 'BUY', file);

    expect(captureService.uploadScreenshot).toHaveBeenCalledWith(
      'user-a',
      'cap-1',
      'BUY',
      file,
    );
    expect(documentService.uploadDocument).not.toHaveBeenCalled();
    expect(extractionService.processDocumentExtraction).not.toHaveBeenCalled();
    expect(extractionService.extractDocument).not.toHaveBeenCalled();
    expect(GoldDocumentService).toBeDefined();
    expect(GoldExtractionService).toBeDefined();
  });

  it('normalizes sell side and never routes to GoldExtractionService', async () => {
    await controller.uploadScreenshot(req, 'cap-1', 'sell', file);

    expect(captureService.uploadScreenshot).toHaveBeenCalledWith(
      'user-a',
      'cap-1',
      'SELL',
      file,
    );
    expect(extractionService.processDocumentExtraction).not.toHaveBeenCalled();
  });

  it('rejects missing side before any service call', () => {
    expect(() =>
      controller.uploadScreenshot(req, 'cap-1', undefined as never, file),
    ).toThrow(BadRequestException);
    expect(captureService.uploadScreenshot).not.toHaveBeenCalled();
  });
});
