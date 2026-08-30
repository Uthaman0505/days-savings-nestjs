import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ConfirmGoldExtractionItemInput } from './dto/confirm-gold-extraction-item.input';
import { RejectGoldExtractionItemInput } from './dto/reject-gold-extraction-item.input';
import { GoldDocument } from './gold-document.entity';
import {
  GoldExtractionItem,
  type GoldExtractionItemStatus,
} from './gold-extraction-item.entity';
import {
  normalizeExtractionCandidate,
  toExtractionWarningCodes,
  type RawExtractionCandidate,
} from './gold-extraction-normalize';
import {
  extractTextFromPdfBuffer,
  PdfTextExtractionError,
} from './extraction/pdf-text.extractor';
import {
  parsePublicGoldDocument,
  type PublicGoldParsedCandidate,
} from './extraction/public-gold-document.parser';
import { GoldExtractionItemModel } from './models/gold-extraction-item.model';
import { ConfirmGoldExtractionItemResultModel } from './models/confirm-gold-extraction-item.model';
import { GoldService } from './gold.service';
import { ObjectStorageService } from '../storage/object-storage.service';

export type StubExtractionCandidateInput = RawExtractionCandidate & {
  parserWarnings?: string[];
};

export type DocumentItemCounts = {
  extractedItemCount: number;
  confirmedItemCount: number;
  rejectedItemCount: number;
  pendingItemCount: number;
};

export class GoldExtractionError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'GoldExtractionError';
  }
}

const DOCUMENT_STATUS = {
  UPLOADED: 'UPLOADED',
  EXTRACTING: 'EXTRACTING',
  EXTRACTED: 'EXTRACTED',
  FAILED: 'FAILED',
} as const;

const LOCKED_ITEM_STATUSES: GoldExtractionItemStatus[] = ['CONFIRMED'];
const PENDING_ITEM_STATUSES: GoldExtractionItemStatus[] = [
  'DETECTED',
  'NEEDS_REVIEW',
];

@Injectable()
export class GoldExtractionService {
  private readonly logger = new Logger(GoldExtractionService.name);

  constructor(
    @InjectRepository(GoldDocument)
    private readonly documentsRepo: Repository<GoldDocument>,
    @InjectRepository(GoldExtractionItem)
    private readonly itemsRepo: Repository<GoldExtractionItem>,
    private readonly storage: ObjectStorageService,
    private readonly dataSource: DataSource,
    private readonly goldService: GoldService,
  ) {}

  /**
   * Phase 2C — retrieve stored document, extract text, parse Public Gold format,
   * persist GoldExtractionItem rows. Does not create GoldPurchase records.
   */
  async processDocumentExtraction(
    userId: string,
    documentId: string,
  ): Promise<GoldExtractionItemModel[] | null> {
    try {
      const document = await this.requireOwnedDocument(userId, documentId);
      await this.assertReExtractionAllowed(documentId);

      const fileBuffer = await this.storage.getObjectBuffer(
        document.storageKey,
      );
      const candidates = await this.extractCandidatesFromFile(
        document.mimeType,
        fileBuffer,
      );

      if (candidates.length === 0) {
        throw new GoldExtractionError('NO_PURCHASE_ROWS_FOUND');
      }

      return await this.persistCandidates(document, candidates);
    } catch (err) {
      const code = this.resolveFailureCode(err);
      await this.markDocumentFailed(documentId, code);
      this.logger.warn(
        `Gold extraction failed documentId=${documentId} code=${code}`,
      );
      if (
        err instanceof GoldExtractionError ||
        err instanceof BadRequestException
      ) {
        return null;
      }
      throw err;
    }
  }

  /** Re-run extraction for FAILED/EXTRACTED/UPLOADED documents (owner only). */
  async retryDocumentExtraction(
    userId: string,
    documentId: string,
  ): Promise<GoldExtractionItemModel[]> {
    const document = await this.requireOwnedDocument(userId, documentId);
    if (document.extractionStatus === DOCUMENT_STATUS.EXTRACTING) {
      throw new BadRequestException('Extraction is already in progress.');
    }

    const result = await this.processDocumentExtraction(userId, documentId);
    if (!result) {
      const refreshed = await this.documentsRepo.findOne({
        where: { id: documentId },
      });
      throw new BadRequestException(
        refreshed?.extractionError ?? 'Extraction failed.',
      );
    }
    return result;
  }

  /**
   * Phase 2D — user-reviewed values create a GoldPurchase and link the extraction item.
   */
  async confirmExtractionItem(
    userId: string,
    input: ConfirmGoldExtractionItemInput,
  ): Promise<ConfirmGoldExtractionItemResultModel> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const item = await queryRunner.manager.findOne(GoldExtractionItem, {
        where: { id: input.extraction_item_id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException('Extraction item not found.');
      }
      if (item.userId !== userId) {
        throw new ForbiddenException('You do not own this extraction item.');
      }

      if (item.status === 'CONFIRMED' && item.goldPurchaseId) {
        await queryRunner.commitTransaction();
        const purchase = await this.goldService.findPurchaseById(
          userId,
          item.goldPurchaseId,
        );
        return {
          purchase,
          extractionItem: this.toModel(item),
          warnings: [],
        };
      }

      if (item.status === 'REJECTED') {
        throw new BadRequestException(
          'Cannot confirm a rejected extraction item.',
        );
      }

      const source = this.resolveImportSource(item);
      const savedPurchase = await this.goldService.createPurchaseEntity(
        userId,
        {
          purchase_date: input.purchase_date,
          weight_grams: input.weight_grams,
          amount_paid_cents: input.amount_paid_cents,
          price_per_gram_cents: input.price_per_gram_cents,
          reference_number: input.reference_number,
          notes: input.notes,
        },
        source,
        queryRunner.manager,
      );

      const confirmedAt = new Date();
      item.status = 'CONFIRMED';
      item.goldPurchaseId = savedPurchase.id;
      item.confirmedAt = confirmedAt;
      item.purchaseDate = savedPurchase.purchaseDate;
      item.weightGrams = savedPurchase.weightGrams;
      item.amountPaidCents = savedPurchase.amountPaidCents;
      item.pricePerGramCents = savedPurchase.pricePerGramCents;
      item.referenceNumber = savedPurchase.referenceNumber;

      const savedItem = await queryRunner.manager.save(
        GoldExtractionItem,
        item,
      );

      await this.maybeMarkDocumentConfirmed(
        item.goldDocumentId,
        queryRunner.manager,
      );

      const warnings = await this.goldService.findLogicalDuplicateWarnings(
        userId,
        savedPurchase.purchaseDate,
        savedPurchase.referenceNumber,
        savedPurchase.id,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();

      const purchase = await this.goldService.findPurchaseById(
        userId,
        savedPurchase.id,
      );

      return {
        purchase,
        extractionItem: this.toModel(savedItem),
        warnings,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** Mark an extraction row as skipped by the user. */
  async rejectExtractionItem(
    userId: string,
    input: RejectGoldExtractionItemInput,
  ): Promise<GoldExtractionItemModel> {
    const item = await this.itemsRepo.findOne({
      where: { id: input.extraction_item_id },
    });

    if (!item) {
      throw new NotFoundException('Extraction item not found.');
    }
    if (item.userId !== userId) {
      throw new ForbiddenException('You do not own this extraction item.');
    }

    if (item.status === 'CONFIRMED') {
      throw new BadRequestException(
        'Cannot reject an extraction item that is already confirmed.',
      );
    }

    if (item.status === 'REJECTED') {
      return this.toModel(item);
    }

    item.status = 'REJECTED';
    item.rejectedAt = new Date();
    const saved = await this.itemsRepo.save(item);
    await this.maybeMarkDocumentConfirmed(item.goldDocumentId);
    return this.toModel(saved);
  }

  /**
   * Phase 2B stub — creates candidate rows from prepared fixture data.
   */
  async processStubExtraction(
    userId: string,
    documentId: string,
    candidates: StubExtractionCandidateInput[],
  ): Promise<GoldExtractionItemModel[]> {
    const document = await this.requireOwnedDocument(userId, documentId);

    if (candidates.length === 0) {
      throw new BadRequestException(
        'At least one extraction candidate is required.',
      );
    }

    await this.assertReExtractionAllowed(documentId);

    const parsed: PublicGoldParsedCandidate[] = candidates.map((candidate) => ({
      purchaseDate: candidate.purchaseDate ?? null,
      weightGrams: candidate.weightGrams ?? null,
      amountPaidCents: candidate.amountPaidCents ?? null,
      pricePerGramCents: candidate.pricePerGramCents ?? null,
      referenceNumber: candidate.referenceNumber ?? null,
      rawFields: candidate.rawFields ?? null,
      confidence: candidate.confidence ?? null,
      parserWarnings: candidate.parserWarnings ?? [],
    }));

    try {
      return await this.persistCandidates(document, parsed);
    } catch (err) {
      const code = this.resolveFailureCode(err);
      await this.markDocumentFailed(documentId, code);
      throw err;
    }
  }

  async findItemsByDocumentId(
    userId: string,
    documentId: string,
  ): Promise<GoldExtractionItemModel[]> {
    await this.requireOwnedDocument(userId, documentId);
    const rows = await this.itemsRepo.find({
      where: { goldDocumentId: documentId, userId },
      order: { rowIndex: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async countItemsForDocuments(
    userId: string,
    documentIds: string[],
  ): Promise<Map<string, DocumentItemCounts>> {
    const result = new Map<string, DocumentItemCounts>();
    if (documentIds.length === 0) {
      return result;
    }

    const rows = await this.itemsRepo.find({
      where: { userId, goldDocumentId: In(documentIds) },
      select: ['goldDocumentId', 'status'],
    });

    for (const id of documentIds) {
      result.set(id, {
        extractedItemCount: 0,
        confirmedItemCount: 0,
        rejectedItemCount: 0,
        pendingItemCount: 0,
      });
    }

    for (const row of rows) {
      const counts = result.get(row.goldDocumentId);
      if (!counts) {
        continue;
      }
      counts.extractedItemCount += 1;
      if (row.status === 'CONFIRMED') {
        counts.confirmedItemCount += 1;
      } else if (row.status === 'REJECTED') {
        counts.rejectedItemCount += 1;
      } else {
        counts.pendingItemCount += 1;
      }
    }

    return result;
  }

  private async extractCandidatesFromFile(
    mimeType: string,
    fileBuffer: Buffer,
  ): Promise<PublicGoldParsedCandidate[]> {
    if (mimeType === 'application/pdf') {
      let text: string;
      try {
        text = await extractTextFromPdfBuffer(fileBuffer);
      } catch (err) {
        if (err instanceof PdfTextExtractionError) {
          throw new GoldExtractionError(err.code);
        }
        throw new GoldExtractionError('PDF_TEXT_EXTRACTION_FAILED');
      }

      const parsed = parsePublicGoldDocument(text);
      if (!parsed.ok) {
        throw new GoldExtractionError(parsed.errorCode);
      }
      return parsed.candidates;
    }

    if (mimeType.startsWith('image/')) {
      throw new GoldExtractionError('OCR_NOT_IMPLEMENTED');
    }

    throw new GoldExtractionError('UNSUPPORTED_DOCUMENT_FORMAT');
  }

  private async persistCandidates(
    document: GoldDocument,
    candidates: PublicGoldParsedCandidate[],
  ): Promise<GoldExtractionItemModel[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(
        GoldDocument,
        { id: document.id },
        {
          extractionStatus: DOCUMENT_STATUS.EXTRACTING,
          extractionError: null,
        },
      );

      await queryRunner.manager.delete(GoldExtractionItem, {
        goldDocumentId: document.id,
      });

      const entities: GoldExtractionItem[] = candidates.map(
        (candidate, rowIndex) => {
          const normalized = normalizeExtractionCandidate(
            candidate,
            toExtractionWarningCodes(candidate.parserWarnings ?? []),
          );
          return this.itemsRepo.create({
            goldDocumentId: document.id,
            userId: document.userId,
            rowIndex,
            status: normalized.status,
            purchaseDate: normalized.purchaseDate,
            weightGrams: normalized.weightGrams,
            amountPaidCents: normalized.amountPaidCents,
            pricePerGramCents: normalized.pricePerGramCents,
            referenceNumber: normalized.referenceNumber,
            confidence: normalized.confidence,
            rawFields: normalized.rawFields,
            validationWarnings: normalized.validationWarnings,
          });
        },
      );

      const saved = await queryRunner.manager.save(
        GoldExtractionItem,
        entities,
      );

      await queryRunner.manager.update(
        GoldDocument,
        { id: document.id },
        {
          extractionStatus: DOCUMENT_STATUS.EXTRACTED,
          extractionError: null,
          rawExtract: {
            documentType:
              (candidates[0]?.rawFields?.documentType as string | undefined) ??
              undefined,
            extractionSource: 'IMPORT',
            itemCount: candidates.length,
          },
        },
      );

      await queryRunner.commitTransaction();
      return saved
        .sort((a, b) => a.rowIndex - b.rowIndex)
        .map((row) => this.toModel(row));
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async markDocumentFailed(
    documentId: string,
    code: string,
  ): Promise<void> {
    await this.documentsRepo.update(documentId, {
      extractionStatus: DOCUMENT_STATUS.FAILED,
      extractionError: code.slice(0, 2000),
    });
  }

  private resolveFailureCode(err: unknown): string {
    if (err instanceof GoldExtractionError) {
      return err.code;
    }
    if (err instanceof PdfTextExtractionError) {
      return err.code;
    }
    if (err instanceof BadRequestException) {
      const response = err.getResponse();
      if (typeof response === 'string') {
        return response.slice(0, 2000);
      }
      if (
        typeof response === 'object' &&
        response &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message.slice(0, 2000);
      }
    }
    if (err instanceof Error) {
      return 'EXTRACTION_FAILED';
    }
    return 'EXTRACTION_FAILED';
  }

  private async assertReExtractionAllowed(documentId: string): Promise<void> {
    const lockedCount = await this.itemsRepo.count({
      where: { goldDocumentId: documentId, status: In(LOCKED_ITEM_STATUSES) },
    });
    if (lockedCount > 0) {
      throw new BadRequestException(
        'Cannot re-run extraction while confirmed items exist.',
      );
    }

    const linked = await this.itemsRepo
      .createQueryBuilder('item')
      .where('item.gold_document_id = :documentId', { documentId })
      .andWhere('item.gold_purchase_id IS NOT NULL')
      .getOne();

    if (linked) {
      throw new BadRequestException(
        'Cannot re-run extraction while items are linked to purchases.',
      );
    }
  }

  private async requireOwnedDocument(
    userId: string,
    documentId: string,
  ): Promise<GoldDocument> {
    const row = await this.documentsRepo.findOne({
      where: { id: documentId, userId, isActive: true },
    });
    if (!row) {
      throw new NotFoundException('Gold document not found.');
    }
    return row;
  }

  private resolveImportSource(item: GoldExtractionItem): 'IMPORT' | 'OCR' {
    const raw = item.rawFields;
    if (raw && raw.extractionSource === 'IMPORT') {
      return 'IMPORT';
    }
    return 'OCR';
  }

  private async maybeMarkDocumentConfirmed(
    documentId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const itemsRepo = manager
      ? manager.getRepository(GoldExtractionItem)
      : this.itemsRepo;
    const pendingCount = await itemsRepo.count({
      where: {
        goldDocumentId: documentId,
        status: In(PENDING_ITEM_STATUSES),
      },
    });

    if (pendingCount === 0) {
      const docRepo = manager
        ? manager.getRepository(GoldDocument)
        : this.documentsRepo;
      await docRepo.update(documentId, { confirmedAt: new Date() });
    }
  }

  toModel(row: GoldExtractionItem): GoldExtractionItemModel {
    return {
      id: row.id,
      goldDocumentId: row.goldDocumentId,
      userId: row.userId,
      rowIndex: row.rowIndex,
      status: row.status,
      purchaseDate: row.purchaseDate,
      weightGrams: row.weightGrams,
      amountPaidCents: row.amountPaidCents,
      pricePerGramCents: row.pricePerGramCents,
      referenceNumber: row.referenceNumber,
      confidence: row.confidence != null ? Number(row.confidence) : null,
      validationWarnings: row.validationWarnings ?? [],
      goldPurchaseId: row.goldPurchaseId,
      confirmedAt: row.confirmedAt,
      rejectedAt: row.rejectedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
