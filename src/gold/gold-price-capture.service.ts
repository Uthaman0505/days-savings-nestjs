import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  extensionFromMime,
  validateGoldDocumentContentType,
} from '../storage/file-content-type';
import { ObjectStorageService } from '../storage/object-storage.service';
import { MAX_GOLD_DOCUMENT_BYTES } from '../storage/upload-limits';
import { ConfirmGoldPriceCaptureInput } from './dto/confirm-gold-price-capture.input';
import { ImageTextExtractorService } from './extraction/image-text.extractor';
import {
  compactOcrSnippet,
  compareScreenshotTimestamps,
  parsePublicGoldPriceScreenshot,
  validatePriceSpread,
} from './extraction/public-gold-price-screenshot.parser';
import { GoldPriceCapture } from './gold-price-capture.entity';
import {
  GoldPriceScreenshot,
  type GoldPriceScreenshotSide,
} from './gold-price-screenshot.entity';
import { GoldService } from './gold.service';
import { GoldPriceCaptureModel } from './models/gold-price-capture.model';

type UploadScreenshotFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type GoldPriceScreenshotUploadResult = {
  capture: GoldPriceCaptureModel;
  screenshotId: string;
  duplicate: boolean;
};

@Injectable()
export class GoldPriceCaptureService {
  private readonly logger = new Logger(GoldPriceCaptureService.name);

  constructor(
    @InjectRepository(GoldPriceCapture)
    private readonly capturesRepo: Repository<GoldPriceCapture>,
    @InjectRepository(GoldPriceScreenshot)
    private readonly screenshotsRepo: Repository<GoldPriceScreenshot>,
    private readonly storage: ObjectStorageService,
    private readonly ocr: ImageTextExtractorService,
    private readonly goldService: GoldService,
    private readonly dataSource: DataSource,
  ) {}

  async createCapture(userId: string): Promise<GoldPriceCaptureModel> {
    const row = this.capturesRepo.create({
      userId,
      status: 'UPLOADED',
      isActive: true,
    });
    const saved = await this.capturesRepo.save(row);
    return this.toModel(saved, []);
  }

  async uploadScreenshot(
    userId: string,
    captureId: string,
    side: GoldPriceScreenshotSide,
    file: UploadScreenshotFile,
  ): Promise<GoldPriceScreenshotUploadResult> {
    this.requireValidImageFile(file);
    if (side !== 'BUY' && side !== 'SELL') {
      throw new BadRequestException('side must be BUY or SELL.');
    }

    const capture = await this.requireOwnedCapture(userId, captureId);
    if (capture.status === 'CONFIRMED') {
      throw new BadRequestException('Capture is already confirmed.');
    }

    const contentType = validateGoldDocumentContentType(
      file.buffer,
      file.mimetype,
    );
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException(
        'Price screenshots must be JPEG, PNG or WebP images.',
      );
    }

    const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');
    const existingHash = await this.screenshotsRepo.findOne({
      where: { userId, sha256Hash, isActive: true },
    });
    if (existingHash) {
      // Keep the current capture session. Duplicate protection must not swap
      // the UI onto a different (possibly confirmed) capture.
      const current = await this.findCaptureById(userId, captureId);
      return {
        capture: current,
        screenshotId: existingHash.id,
        duplicate: true,
      };
    }

    const existingSide = await this.screenshotsRepo.findOne({
      where: { captureId, side, isActive: true },
    });

    const screenshotId = existingSide?.id ?? randomUUID();
    const ext = extensionFromMime(contentType);
    const storageKey = `gold-price/${userId}/${captureId}/${side.toLowerCase()}-${Date.now()}-${randomUUID()}.${ext}`;
    const previousStorageKey = existingSide?.storageKey;

    try {
      await this.storage.putObject({
        key: storageKey,
        body: file.buffer,
        contentType,
      });
    } catch {
      throw new InternalServerErrorException('Failed to store screenshot.');
    }

    const screenshot = existingSide
      ? Object.assign(existingSide, {
          originalFileName: this.sanitizeFileName(file.originalname),
          mimeType: contentType,
          fileSizeBytes: file.size,
          storageKey,
          sha256Hash,
          extractionStatus: 'EXTRACTING',
          extractionError: null,
          screenType: null,
          extractedPgPricePerGramCents: null,
          extractedUpdatedAt: null,
          warnings: null,
        })
      : this.screenshotsRepo.create({
          id: screenshotId,
          captureId,
          userId,
          side,
          originalFileName: this.sanitizeFileName(file.originalname),
          mimeType: contentType,
          fileSizeBytes: file.size,
          storageKey,
          sha256Hash,
          extractionStatus: 'EXTRACTING',
          isActive: true,
        });

    let savedScreenshot: GoldPriceScreenshot;
    try {
      savedScreenshot = await this.screenshotsRepo.save(screenshot);
    } catch (err) {
      await this.storage.deleteObject(storageKey);
      throw err;
    }

    if (previousStorageKey && previousStorageKey !== storageKey) {
      try {
        await this.storage.deleteObject(previousStorageKey);
      } catch {
        this.logger.warn(
          `Failed to delete replaced screenshot object captureId=${captureId} side=${side}`,
        );
      }
    }

    await this.extractScreenshot(savedScreenshot, file.buffer);
    const refreshed = await this.recomputeCapture(captureId);
    const shots = await this.loadActiveScreenshots(captureId);
    return {
      capture: this.toModel(refreshed, shots),
      screenshotId: savedScreenshot.id,
      duplicate: false,
    };
  }

  async findCaptureById(
    userId: string,
    captureId: string,
  ): Promise<GoldPriceCaptureModel> {
    const row = await this.requireOwnedCapture(userId, captureId);
    const shots = await this.loadActiveScreenshots(captureId);
    return this.toModel(row, shots);
  }

  async findMyCaptures(userId: string): Promise<GoldPriceCaptureModel[]> {
    const rows = await this.capturesRepo.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const result: GoldPriceCaptureModel[] = [];
    for (const row of rows) {
      const shots = await this.loadActiveScreenshots(row.id);
      result.push(this.toModel(row, shots));
    }
    return result;
  }

  async confirmCapture(
    userId: string,
    input: ConfirmGoldPriceCaptureInput,
  ): Promise<GoldPriceCaptureModel> {
    return this.dataSource.transaction(async (manager) => {
      const capture = await manager.findOne(GoldPriceCapture, {
        where: { id: input.capture_id, userId, isActive: true },
      });
      if (!capture) {
        throw new NotFoundException('Price capture not found.');
      }
      if (capture.status === 'CONFIRMED') {
        throw new BadRequestException('Capture is already confirmed.');
      }

      const pgSell =
        input.pg_sell_price_per_gram_cents ?? capture.pgSellPricePerGramCents;
      const pgBuy =
        input.pg_buy_price_per_gram_cents ?? capture.pgBuyPricePerGramCents;

      if (pgSell == null || pgBuy == null) {
        throw new BadRequestException(
          'Both PG SELL and PG BUY prices are required before confirmation.',
        );
      }

      const spread = validatePriceSpread(pgSell, pgBuy);
      if (!spread.valid) {
        throw new BadRequestException(
          'Invalid price spread: PG SELL must be >= PG BUY.',
        );
      }

      const shots = await manager.find(GoldPriceScreenshot, {
        where: { captureId: capture.id, isActive: true },
      });
      const buyShot = shots.find((s) => s.side === 'BUY');
      const sellShot = shots.find((s) => s.side === 'SELL');
      const tsCheck = compareScreenshotTimestamps(
        buyShot?.extractedUpdatedAt ?? null,
        sellShot?.extractedUpdatedAt ?? null,
      );
      if (!tsCheck.match) {
        throw new BadRequestException(
          'Buy and Sell screenshot timestamps must match before confirmation.',
        );
      }

      const capturedAt =
        input.captured_price_at != null
          ? new Date(input.captured_price_at)
          : capture.capturedPriceAt;
      const priceDate =
        input.price_date?.trim() ||
        capture.priceDate ||
        this.dateFromTimestamp(capturedAt);

      if (!capturedAt || !priceDate) {
        throw new BadRequestException('Price timestamp is required.');
      }

      const goldPrice = await this.goldService.confirmScreenshotPrice(
        userId,
        {
          priceDate,
          capturedPriceAt: capturedAt,
          pgBuyPricePerGramCents: pgBuy,
          pgSellPricePerGramCents: pgSell,
          notes: input.notes?.trim() || null,
        },
        manager,
      );

      capture.status = 'CONFIRMED';
      capture.pgBuyPricePerGramCents = pgBuy;
      capture.pgSellPricePerGramCents = pgSell;
      capture.capturedPriceAt = capturedAt;
      capture.priceDate = priceDate;
      capture.confirmedGoldPriceId = goldPrice.id;
      capture.warnings = null;
      capture.extractionError = null;

      const saved = await manager.save(GoldPriceCapture, capture);
      const activeShots = shots.filter((s) => s.isActive);
      return this.toModel(saved, activeShots);
    });
  }

  private async extractScreenshot(
    screenshot: GoldPriceScreenshot,
    buffer: Buffer,
  ): Promise<void> {
    try {
      this.logger.log(
        `Price screenshot OCR start captureId=${screenshot.captureId} side=${screenshot.side} pipeline=gold-price-capture`,
      );
      const text = await this.ocr.extractTextFromImageBuffer(buffer);
      const parsed = parsePublicGoldPriceScreenshot(text);

      if (!parsed.ok) {
        screenshot.extractionStatus = 'FAILED';
        screenshot.extractionError = parsed.errorCode;
        screenshot.warnings = parsed.warnings;
        this.logger.warn(
          `Price screenshot parse failed captureId=${screenshot.captureId} side=${screenshot.side} code=${parsed.errorCode} pipeline=gold-price-capture ocrSnippet="${compactOcrSnippet(text)}"`,
        );
        await this.screenshotsRepo.save(screenshot);
        return;
      }

      const expectedScreen = screenshot.side === 'BUY' ? 'BUY_GAP' : 'SELL_GAP';
      const warnings = [...parsed.warnings];
      if (parsed.screenType !== expectedScreen) {
        warnings.push('SCREEN_SIDE_MISMATCH');
      }

      screenshot.screenType = parsed.screenType;
      screenshot.extractedPgPricePerGramCents = parsed.pgPricePerGramCents;
      screenshot.extractedUpdatedAt = parsed.updatedAt;
      screenshot.extractionStatus = 'EXTRACTED';
      screenshot.extractionError = null;
      screenshot.warnings = warnings.length > 0 ? warnings : null;
      await this.screenshotsRepo.save(screenshot);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'EXTRACTION_FAILED';
      screenshot.extractionStatus = 'FAILED';
      screenshot.extractionError = code;
      this.logger.warn(
        `Price screenshot OCR failed captureId=${screenshot.captureId} side=${screenshot.side} code=${code} pipeline=gold-price-capture`,
      );
      await this.screenshotsRepo.save(screenshot);
    }
  }

  private async recomputeCapture(captureId: string): Promise<GoldPriceCapture> {
    const capture = await this.capturesRepo.findOne({
      where: { id: captureId },
    });
    if (!capture) {
      throw new NotFoundException('Price capture not found.');
    }

    const shots = await this.loadActiveScreenshots(captureId);
    const buyShot = shots.find((s) => s.side === 'BUY');
    const sellShot = shots.find((s) => s.side === 'SELL');

    const warnings: string[] = [];

    if (buyShot?.extractedPgPricePerGramCents != null) {
      capture.pgSellPricePerGramCents = buyShot.extractedPgPricePerGramCents;
    }
    if (sellShot?.extractedPgPricePerGramCents != null) {
      capture.pgBuyPricePerGramCents = sellShot.extractedPgPricePerGramCents;
    }

    const tsCheck = compareScreenshotTimestamps(
      buyShot?.extractedUpdatedAt ?? null,
      sellShot?.extractedUpdatedAt ?? null,
    );
    if (tsCheck.warning) {
      warnings.push(tsCheck.warning);
    }

    const updatedAt =
      buyShot?.extractedUpdatedAt ?? sellShot?.extractedUpdatedAt;
    if (updatedAt) {
      capture.capturedPriceAt = updatedAt;
      capture.priceDate = this.dateFromTimestamp(updatedAt);
    }

    if (
      capture.pgSellPricePerGramCents != null &&
      capture.pgBuyPricePerGramCents != null
    ) {
      const spread = validatePriceSpread(
        capture.pgSellPricePerGramCents,
        capture.pgBuyPricePerGramCents,
      );
      if (spread.warning) {
        warnings.push(spread.warning);
      }
    }

    const anyFailed = shots.some((s) => s.extractionStatus === 'FAILED');
    const hasBoth =
      capture.pgSellPricePerGramCents != null &&
      capture.pgBuyPricePerGramCents != null;

    if (anyFailed) {
      capture.status = 'FAILED';
      capture.extractionError = 'SCREENSHOT_EXTRACTION_FAILED';
    } else if (hasBoth && tsCheck.match && warnings.length === 0) {
      capture.status = 'READY';
      capture.extractionError = null;
    } else if (buyShot || sellShot) {
      capture.status = 'NEEDS_REVIEW';
      capture.extractionError = null;
    } else {
      capture.status = 'UPLOADED';
    }

    capture.warnings = warnings.length > 0 ? warnings : null;
    return this.capturesRepo.save(capture);
  }

  private async loadActiveScreenshots(
    captureId: string,
  ): Promise<GoldPriceScreenshot[]> {
    return this.screenshotsRepo.find({
      where: { captureId, isActive: true },
      order: { side: 'ASC' },
    });
  }

  private async requireOwnedCapture(
    userId: string,
    captureId: string,
  ): Promise<GoldPriceCapture> {
    const row = await this.capturesRepo.findOne({
      where: { id: captureId, userId, isActive: true },
    });
    if (!row) {
      throw new NotFoundException('Price capture not found.');
    }
    return row;
  }

  private requireValidImageFile(file: UploadScreenshotFile | undefined): void {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Screenshot file is required.');
    }
    if (file.size > MAX_GOLD_DOCUMENT_BYTES) {
      throw new BadRequestException('Screenshot too large. Max size is 15MB.');
    }
  }

  private sanitizeFileName(name: string): string {
    const base = (name || 'screenshot').replace(/[/\\]/g, '_');
    return base.slice(0, 255) || 'screenshot';
  }

  private dateFromTimestamp(value: Date | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const d = new Date(value);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private toModel(
    row: GoldPriceCapture,
    screenshots: GoldPriceScreenshot[],
  ): GoldPriceCaptureModel {
    const buyShot = screenshots.find((s) => s.side === 'BUY');
    const sellShot = screenshots.find((s) => s.side === 'SELL');
    const spreadCents =
      row.pgSellPricePerGramCents != null && row.pgBuyPricePerGramCents != null
        ? row.pgSellPricePerGramCents - row.pgBuyPricePerGramCents
        : null;

    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      pgBuyPricePerGramCents: row.pgBuyPricePerGramCents,
      pgSellPricePerGramCents: row.pgSellPricePerGramCents,
      spreadPerGramCents: spreadCents,
      capturedPriceAt: row.capturedPriceAt,
      priceDate: row.priceDate,
      warnings: row.warnings ?? [],
      extractionError: row.extractionError,
      confirmedGoldPriceId: row.confirmedGoldPriceId,
      buyScreenshot: buyShot ? this.toScreenshotModel(buyShot) : null,
      sellScreenshot: sellShot ? this.toScreenshotModel(sellShot) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toScreenshotModel(row: GoldPriceScreenshot) {
    return {
      id: row.id,
      captureId: row.captureId,
      side: row.side,
      screenType: row.screenType,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      extractedPgPricePerGramCents: row.extractedPgPricePerGramCents,
      extractedUpdatedAt: row.extractedUpdatedAt,
      extractionStatus: row.extractionStatus,
      extractionError: row.extractionError,
      warnings: row.warnings ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
