import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { QueryFailedError, Repository } from 'typeorm';
import {
  extensionFromMime,
  validateGoldDocumentContentType,
} from '../storage/file-content-type';
import { ObjectStorageService } from '../storage/object-storage.service';
import { MAX_GOLD_DOCUMENT_BYTES } from '../storage/upload-limits';
import { GoldDocument } from './gold-document.entity';
import { GoldExtractionService } from './gold-extraction.service';
import { GoldDocumentModel } from './models/gold-document.model';
import type { DocumentItemCounts } from './gold-extraction.service';

type UploadDocumentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type GoldDocumentUploadResult = {
  document: GoldDocumentModel;
  duplicate: boolean;
};

const UPLOADED_STATUS = 'UPLOADED';

@Injectable()
export class GoldDocumentService {
  private readonly publicAppUrl: string | undefined;

  constructor(
    @InjectRepository(GoldDocument)
    private readonly documentsRepo: Repository<GoldDocument>,
    private readonly storage: ObjectStorageService,
    private readonly extractionService: GoldExtractionService,
    configService: ConfigService,
  ) {
    this.publicAppUrl = configService.get<string>('PUBLIC_APP_URL')?.trim();
  }

  async uploadDocument(
    userId: string,
    file: UploadDocumentFile,
  ): Promise<GoldDocumentUploadResult> {
    this.requireValidUploadFile(file);
    const contentType = validateGoldDocumentContentType(
      file.buffer,
      file.mimetype,
    );
    const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.documentsRepo.findOne({
      where: { userId, sha256Hash },
    });
    if (existing) {
      return {
        document: this.toModel(existing, undefined, null),
        duplicate: true,
      };
    }

    const documentId = randomUUID();
    const ext = extensionFromMime(contentType);
    const storageKey = `gold/${userId}/${documentId}/${Date.now()}-${randomUUID()}.${ext}`;

    try {
      await this.storage.putObject({
        key: storageKey,
        body: file.buffer,
        contentType,
      });
    } catch (err) {
      if (err instanceof InternalServerErrorException) {
        throw err;
      }
      throw new InternalServerErrorException('Failed to store gold document.');
    }

    const entity = this.documentsRepo.create({
      id: documentId,
      userId,
      originalFileName: this.sanitizeOriginalFileName(file.originalname),
      mimeType: contentType,
      fileSizeBytes: file.size,
      storageKey,
      sha256Hash,
      extractionStatus: UPLOADED_STATUS,
    });

    try {
      const saved = await this.documentsRepo.save(entity);
      this.scheduleExtraction(userId, saved.id);
      return {
        document: this.toModel(saved, undefined, null),
        duplicate: false,
      };
    } catch (err) {
      await this.storage.deleteObject(storageKey);
      if (this.isUniqueViolation(err)) {
        const duplicate = await this.documentsRepo.findOne({
          where: { userId, sha256Hash },
        });
        if (duplicate) {
          return {
            document: this.toModel(duplicate, undefined, null),
            duplicate: true,
          };
        }
      }
      throw err;
    }
  }

  async findMyDocuments(userId: string): Promise<GoldDocumentModel[]> {
    const rows = await this.documentsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const counts = await this.extractionService.countItemsForDocuments(
      userId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.toModel(row, counts.get(row.id), null));
  }

  async findDocumentById(
    userId: string,
    documentId: string,
  ): Promise<GoldDocumentModel> {
    const row = await this.requireOwnedDocument(userId, documentId);
    const counts = await this.extractionService.countItemsForDocuments(userId, [
      documentId,
    ]);
    const items = await this.extractionService.findItemsByDocumentId(
      userId,
      documentId,
    );
    return this.toModel(row, counts.get(documentId), items);
  }

  async streamDocumentFileToResponse(
    userId: string,
    documentId: string,
    res: Response,
  ): Promise<void> {
    const row = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!row || row.userId !== userId) {
      res.status(404).send('Document not found');
      return;
    }

    const ok = await this.storage.streamObjectToResponse(row.storageKey, res, {
      contentType: row.mimeType,
      contentDisposition: this.buildContentDisposition(row.originalFileName),
    });
    if (!ok && !res.headersSent) {
      res.status(404).send('Document not found');
    }
  }

  private async requireOwnedDocument(
    userId: string,
    documentId: string,
  ): Promise<GoldDocument> {
    const row = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!row) {
      throw new NotFoundException('Gold document not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this gold document.');
    }
    return row;
  }

  private requireValidUploadFile(file: UploadDocumentFile | undefined): void {
    if (!file?.buffer || file.size <= 0) {
      throw new BadRequestException('Document file is required.');
    }
    if (file.size > MAX_GOLD_DOCUMENT_BYTES) {
      throw new BadRequestException('Document too large. Max size is 15MB.');
    }
  }

  private sanitizeOriginalFileName(name: string): string {
    const base = (name || 'document').replace(/[/\\]/g, '_');
    const cleaned = [...base]
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .trim();
    return cleaned.slice(0, 255) || 'document';
  }

  private buildContentDisposition(originalFileName: string): string {
    const safe = this.sanitizeOriginalFileName(originalFileName).replace(
      /["\\]/g,
      '_',
    );
    const encoded = encodeURIComponent(safe);
    return `inline; filename="${safe}"; filename*=UTF-8''${encoded}`;
  }

  private resolveFileUrl(documentId: string): string | null {
    const base = this.publicAppUrl;
    if (!base) {
      return null;
    }
    return `${base.replace(/\/$/, '')}/gold/documents/${documentId}/file`;
  }

  private toModel(
    row: GoldDocument,
    counts?: DocumentItemCounts,
    extractionItems?: GoldDocumentModel['extractionItems'],
  ): GoldDocumentModel {
    const itemCounts = counts ?? {
      extractedItemCount: 0,
      confirmedItemCount: 0,
      rejectedItemCount: 0,
      pendingItemCount: 0,
    };

    return {
      id: row.id,
      userId: row.userId,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      extractionStatus: row.extractionStatus,
      extractionError: row.extractionError,
      pageCount: row.pageCount,
      confirmedAt: row.confirmedAt,
      extractedItemCount: itemCounts.extractedItemCount,
      confirmedItemCount: itemCounts.confirmedItemCount,
      rejectedItemCount: itemCounts.rejectedItemCount,
      pendingItemCount: itemCounts.pendingItemCount,
      extractionItems: extractionItems ?? null,
      fileUrl: this.resolveFileUrl(row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private scheduleExtraction(userId: string, documentId: string): void {
    void this.extractionService
      .processDocumentExtraction(userId, documentId)
      .catch(() => undefined);
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) {
      return false;
    }
    const driver = err.driverError as { code?: string };
    return driver?.code === '23505';
  }
}
