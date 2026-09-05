import { createHash } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  BUY_GAP_SCREENSHOT_OCR_TEXT,
  SELL_GAP_SCREENSHOT_OCR_TEXT,
} from './extraction/fixtures/public-gold-price-screenshot.fixture';
import { ImageTextExtractorService } from './extraction/image-text.extractor';
import { GoldPriceCapture } from './gold-price-capture.entity';
import { GoldPriceCaptureService } from './gold-price-capture.service';
import { GoldPriceScreenshot } from './gold-price-screenshot.entity';
import { GoldService } from './gold.service';

const PNG_A = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
]);
const PNG_B = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02,
]);

describe('GoldPriceCaptureService', () => {
  let service: GoldPriceCaptureService;
  let captures: GoldPriceCapture[];
  let screenshots: GoldPriceScreenshot[];
  let capturesRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let screenshotsRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let storage: { putObject: jest.Mock; deleteObject: jest.Mock };
  let ocr: { extractTextFromImageBuffer: jest.Mock };
  let extractionService: { processDocumentExtraction: jest.Mock };
  let goldService: { confirmScreenshotPrice: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const now = new Date('2026-08-30T06:37:00.000Z');

  const captureRow = (
    overrides: Partial<GoldPriceCapture> = {},
  ): GoldPriceCapture =>
    ({
      id: 'cap-1',
      userId: 'user-a',
      status: 'UPLOADED',
      pgBuyPricePerGramCents: null,
      pgSellPricePerGramCents: null,
      capturedPriceAt: null,
      priceDate: null,
      warnings: null,
      extractionError: null,
      confirmedGoldPriceId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }) as GoldPriceCapture;

  beforeEach(async () => {
    captures = [captureRow()];
    screenshots = [];
    extractionService = {
      processDocumentExtraction: jest.fn(),
    };
    goldService = {
      confirmScreenshotPrice: jest.fn().mockResolvedValue({ id: 'gp-1' }),
    };
    dataSource = {
      transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
        work({
          findOne: async (
            entity: unknown,
            opts: { where: Partial<GoldPriceCapture> },
          ) => {
            if (entity === GoldPriceCapture) {
              return capturesRepo.findOne(opts);
            }
            return null;
          },
          find: async (
            entity: unknown,
            opts: { where: Partial<GoldPriceScreenshot> },
          ) => {
            if (entity === GoldPriceScreenshot) {
              return screenshotsRepo.find(opts);
            }
            return [];
          },
          save: async (entity: unknown, row: GoldPriceCapture) => {
            if (entity === GoldPriceCapture) {
              return capturesRepo.save(row);
            }
            return row;
          },
        }),
      ),
    };

    capturesRepo = {
      create: jest.fn((x: Partial<GoldPriceCapture>) => x as GoldPriceCapture),
      save: jest.fn(async (row: GoldPriceCapture) => {
        const idx = captures.findIndex((c) => c.id === row.id);
        if (idx >= 0) {
          captures[idx] = { ...captures[idx], ...row };
          return captures[idx];
        }
        captures.push(row);
        return row;
      }),
      findOne: jest.fn(
        async ({ where }: { where: Partial<GoldPriceCapture> }) =>
          captures.find(
            (c) =>
              (!where.id || c.id === where.id) &&
              (!where.userId || c.userId === where.userId) &&
              (where.isActive == null || c.isActive === where.isActive),
          ) ?? null,
      ),
      find: jest.fn(async () => captures),
    };

    screenshotsRepo = {
      create: jest.fn(
        (x: Partial<GoldPriceScreenshot>) => x as GoldPriceScreenshot,
      ),
      save: jest.fn(async (row: GoldPriceScreenshot) => {
        const idx = screenshots.findIndex((s) => s.id === row.id);
        if (idx >= 0) {
          screenshots[idx] = { ...screenshots[idx], ...row };
          return screenshots[idx];
        }
        screenshots.push({ ...row, isActive: row.isActive ?? true });
        return screenshots[screenshots.length - 1];
      }),
      findOne: jest.fn(
        async ({ where }: { where: Partial<GoldPriceScreenshot> }) =>
          screenshots.find((s) => {
            if (where.sha256Hash && s.sha256Hash !== where.sha256Hash) {
              return false;
            }
            if (where.userId && s.userId !== where.userId) {
              return false;
            }
            if (where.captureId && s.captureId !== where.captureId) {
              return false;
            }
            if (where.side && s.side !== where.side) {
              return false;
            }
            if (where.isActive != null && s.isActive !== where.isActive) {
              return false;
            }
            return true;
          }) ?? null,
      ),
      find: jest.fn(
        async ({ where }: { where: Partial<GoldPriceScreenshot> }) =>
          screenshots.filter((s) => {
            if (where.captureId && s.captureId !== where.captureId) {
              return false;
            }
            if (where.isActive != null && s.isActive !== where.isActive) {
              return false;
            }
            return true;
          }),
      ),
    };

    storage = {
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    ocr = {
      extractTextFromImageBuffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldPriceCaptureService,
        {
          provide: getRepositoryToken(GoldPriceCapture),
          useValue: capturesRepo,
        },
        {
          provide: getRepositoryToken(GoldPriceScreenshot),
          useValue: screenshotsRepo,
        },
        { provide: ObjectStorageService, useValue: storage },
        { provide: ImageTextExtractorService, useValue: ocr },
        { provide: GoldService, useValue: goldService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(GoldPriceCaptureService);
  });

  const file = (buffer: Buffer, name: string) => ({
    originalname: name,
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
  });

  it('does not inject or invoke GoldExtractionService for screenshot uploads', async () => {
    ocr.extractTextFromImageBuffer.mockResolvedValue(
      BUY_GAP_SCREENSHOT_OCR_TEXT,
    );

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );

    expect(ocr.extractTextFromImageBuffer).toHaveBeenCalledWith(PNG_A);
    expect(extractionService.processDocumentExtraction).not.toHaveBeenCalled();
    expect(service).not.toHaveProperty('extractionService');
  });

  it('maps Buy GAP screenshot to PG SELL via Tesseract + parser, not OCR_NOT_IMPLEMENTED', async () => {
    ocr.extractTextFromImageBuffer.mockResolvedValue(
      BUY_GAP_SCREENSHOT_OCR_TEXT,
    );

    const result = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy-gap.png'),
    );

    expect(result.duplicate).toBe(false);
    expect(result.capture.pgSellPricePerGramCents).toBe(62500);
    expect(result.capture.pgBuyPricePerGramCents).toBeNull();
    expect(result.capture.buyScreenshot?.extractionError).toBeNull();
    expect(result.capture.buyScreenshot?.extractionError).not.toBe(
      'OCR_NOT_IMPLEMENTED',
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining('gold-price/user-a/cap-1/'),
      }),
    );
  });

  it('maps Sell GAP screenshot to PG BUY', async () => {
    ocr.extractTextFromImageBuffer.mockResolvedValue(
      SELL_GAP_SCREENSHOT_OCR_TEXT,
    );

    const result = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell-gap.png'),
    );

    expect(result.capture.pgBuyPricePerGramCents).toBe(57300);
    expect(result.capture.pgSellPricePerGramCents).toBeNull();
    expect(result.capture.sellScreenshot?.extractionError).not.toBe(
      'OCR_NOT_IMPLEMENTED',
    );
  });

  it('allows replacing an existing side screenshot on the same capture', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(
        BUY_GAP_SCREENSHOT_OCR_TEXT.replace('RM 625/g', 'RM 630/g'),
      );

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    const replaced = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_B, 'buy-2.png'),
    );

    expect(replaced.capture.pgSellPricePerGramCents).toBe(63000);
    expect(screenshots.filter((s) => s.side === 'BUY')).toHaveLength(1);
    expect(storage.deleteObject).toHaveBeenCalled();
  });

  it('keeps the current capture when a duplicate hash belongs to another capture', async () => {
    screenshots.push({
      id: 'old-shot',
      captureId: 'cap-old',
      userId: 'user-a',
      side: 'BUY',
      sha256Hash: createHash('sha256').update(PNG_A).digest('hex'),
      isActive: true,
    } as GoldPriceScreenshot);
    captures.push(captureRow({ id: 'cap-old', status: 'CONFIRMED' }));

    const result = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );

    expect(result.duplicate).toBe(true);
    expect(result.capture.id).toBe('cap-1');
    expect(result.capture.status).not.toBe('CONFIRMED');
    expect(ocr.extractTextFromImageBuffer).not.toHaveBeenCalled();
  });

  it('rejects non-image files before OCR', async () => {
    const pdf = Buffer.from('%PDF-1.4');
    await expect(
      service.uploadScreenshot('user-a', 'cap-1', 'BUY', {
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        size: pdf.length,
        buffer: pdf,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ocr.extractTextFromImageBuffer).not.toHaveBeenCalled();
  });

  it('rejects a missing capture owned by another user', async () => {
    await expect(
      service.uploadScreenshot(
        'user-b',
        'cap-1',
        'BUY',
        file(PNG_A, 'buy.png'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not flag matching Public Gold source minutes as a timestamp mismatch', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(SELL_GAP_SCREENSHOT_OCR_TEXT);

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    const result = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell.png'),
    );

    expect(result.capture.pgSellPricePerGramCents).toBe(62500);
    expect(result.capture.pgBuyPricePerGramCents).toBe(57300);
    expect(result.capture.warnings).not.toContain('PRICE_TIMESTAMPS_DIFFER');
    expect(result.capture.status).toBe('READY');
  });

  it('keeps extracted prices when timestamps differ by a minute', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(
        SELL_GAP_SCREENSHOT_OCR_TEXT.replace('2:37 PM', '2:38 PM'),
      );

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    const result = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell.png'),
    );

    expect(result.capture.pgSellPricePerGramCents).toBe(62500);
    expect(result.capture.pgBuyPricePerGramCents).toBe(57300);
    expect(result.capture.warnings).toContain('PRICE_TIMESTAMPS_DIFFER');
    expect(result.capture.status).toBe('NEEDS_REVIEW');
  });

  it('uses PRICE_TIMESTAMP_NOT_FOUND when one screenshot has a price but no timestamp', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(
        SELL_GAP_SCREENSHOT_OCR_TEXT.replace(
          /Prices last updated on[^\n]+/,
          '',
        ),
      );

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    const result = await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell.png'),
    );

    expect(result.capture.pgSellPricePerGramCents).toBe(62500);
    expect(result.capture.pgBuyPricePerGramCents).toBe(57300);
    expect(result.capture.warnings).toContain('PRICE_TIMESTAMP_NOT_FOUND');
    expect(result.capture.warnings).not.toContain('PRICE_TIMESTAMPS_DIFFER');
  });

  it('rejects confirmation when timestamps genuinely differ', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(
        SELL_GAP_SCREENSHOT_OCR_TEXT.replace('2:37 PM', '2:38 PM'),
      );

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell.png'),
    );

    await expect(
      service.confirmCapture('user-a', { capture_id: 'cap-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(goldService.confirmScreenshotPrice).not.toHaveBeenCalled();
  });

  it('rejects confirmation when a source timestamp is missing', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(
        SELL_GAP_SCREENSHOT_OCR_TEXT.replace(
          /Prices last updated on[^\n]+/,
          '',
        ),
      );

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell.png'),
    );

    await expect(
      service.confirmCapture('user-a', { capture_id: 'cap-1' }),
    ).rejects.toThrow(/Could not detect Public Gold update time/);
    expect(goldService.confirmScreenshotPrice).not.toHaveBeenCalled();
  });

  it('confirms matching minute-normalized timestamps even if seconds differ', async () => {
    ocr.extractTextFromImageBuffer
      .mockResolvedValueOnce(BUY_GAP_SCREENSHOT_OCR_TEXT)
      .mockResolvedValueOnce(SELL_GAP_SCREENSHOT_OCR_TEXT);

    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'BUY',
      file(PNG_A, 'buy.png'),
    );
    await service.uploadScreenshot(
      'user-a',
      'cap-1',
      'SELL',
      file(PNG_B, 'sell.png'),
    );
    screenshots.find((s) => s.side === 'SELL')!.extractedUpdatedAt = new Date(
      '2026-08-30T06:37:49.000Z',
    );

    const confirmed = await service.confirmCapture('user-a', {
      capture_id: 'cap-1',
    });
    expect(confirmed.status).toBe('CONFIRMED');
    expect(goldService.confirmScreenshotPrice).toHaveBeenCalled();
  });
});
