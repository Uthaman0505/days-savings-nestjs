import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { GoldDocument } from './gold-document.entity';
import {
  GoldExtractionItem,
  type GoldExtractionItemStatus,
} from './gold-extraction-item.entity';
import {
  normalizeExtractionCandidate,
  type RawExtractionCandidate,
} from './gold-extraction-normalize';
import { GoldExtractionItemModel } from './models/gold-extraction-item.model';

export type StubExtractionCandidateInput = RawExtractionCandidate;

export type DocumentItemCounts = {
  extractedItemCount: number;
  confirmedItemCount: number;
  rejectedItemCount: number;
  pendingItemCount: number;
};

const DOCUMENT_STATUS = {
  UPLOADED: 'UPLOADED',
  EXTRACTING: 'EXTRACTING',
  EXTRACTED: 'EXTRACTED',
  FAILED: 'FAILED',
} as const;

const LOCKED_ITEM_STATUSES: GoldExtractionItemStatus[] = ['CONFIRMED'];

@Injectable()
export class GoldExtractionService {
  constructor(
    @InjectRepository(GoldDocument)
    private readonly documentsRepo: Repository<GoldDocument>,
    @InjectRepository(GoldExtractionItem)
    private readonly itemsRepo: Repository<GoldExtractionItem>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Phase 2B stub — creates candidate rows from prepared fixture data.
   * Not exposed via public API; intended for tests and internal Phase 2C wiring.
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(
        GoldDocument,
        { id: documentId },
        {
          extractionStatus: DOCUMENT_STATUS.EXTRACTING,
          extractionError: null,
        },
      );

      await queryRunner.manager.delete(GoldExtractionItem, {
        goldDocumentId: documentId,
      });

      const entities: GoldExtractionItem[] = candidates.map(
        (candidate, rowIndex) => {
          const normalized = normalizeExtractionCandidate(candidate);
          return this.itemsRepo.create({
            goldDocumentId: documentId,
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
        { id: documentId },
        { extractionStatus: DOCUMENT_STATUS.EXTRACTED },
      );

      await queryRunner.commitTransaction();
      return saved
        .sort((a, b) => a.rowIndex - b.rowIndex)
        .map((row) => this.toModel(row));
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const message =
        err instanceof Error ? err.message : 'Extraction processing failed.';
      await this.documentsRepo.update(documentId, {
        extractionStatus: DOCUMENT_STATUS.FAILED,
        extractionError: message.slice(0, 2000),
      });
      throw err;
    } finally {
      await queryRunner.release();
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
    const row = await this.documentsRepo.findOne({ where: { id: documentId } });
    if (!row) {
      throw new NotFoundException('Gold document not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this gold document.');
    }
    return row;
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
