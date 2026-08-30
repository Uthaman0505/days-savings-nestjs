import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { ObjectStorageService } from '../storage/object-storage.service';
import { GoldDocument } from './gold-document.entity';
import { GoldDocumentService } from './gold-document.service';
import { GoldExtractionService } from './gold-extraction.service';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
]);

const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

describe('GoldDocumentService', () => {
  let service: GoldDocumentService;
  let documentsRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let transactionManager: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let storage: {
    putObject: jest.Mock;
    deleteObject: jest.Mock;
    streamObjectToResponse: jest.Mock;
    objectExists: jest.Mock;
  };
  let extractionService: {
    countItemsForDocuments: jest.Mock;
    findItemsByDocumentId: jest.Mock;
    processDocumentExtraction: jest.Mock;
    setLinkedPurchasesActiveForDocument: jest.Mock;
  };

  const now = new Date('2026-08-30T00:00:00.000Z');

  const document = (overrides: Partial<GoldDocument> = {}): GoldDocument =>
    ({
      id: 'doc-1',
      userId: 'user-a',
      originalFileName: 'receipt.png',
      mimeType: 'image/png',
      fileSizeBytes: PNG_BYTES.length,
      storageKey: 'gold/user-a/doc-1/123-abc.png',
      sha256Hash:
        'e7cf3ef4f17c3999a94f2be2780176ca4d39afcc6ec56696614828f7a6862a88',
      extractionStatus: 'UPLOADED',
      extractionError: null,
      rawExtract: null,
      pageCount: null,
      confirmedAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }) as GoldDocument;

  beforeEach(async () => {
    transactionManager = {
      findOne: jest.fn(),
      save: jest.fn(async (entity: unknown, row: GoldDocument) => ({
        ...row,
        updatedAt: now,
      })),
    };
    documentsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x: Partial<GoldDocument>) => x as GoldDocument),
      save: jest.fn(async (x: GoldDocument) => ({
        ...x,
        createdAt: x.createdAt ?? now,
        updatedAt: now,
      })),
    };
    storage = {
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      streamObjectToResponse: jest.fn().mockResolvedValue(true),
      objectExists: jest.fn().mockResolvedValue(true),
    };
    extractionService = {
      countItemsForDocuments: jest.fn().mockResolvedValue(new Map()),
      findItemsByDocumentId: jest.fn().mockResolvedValue([]),
      processDocumentExtraction: jest.fn().mockResolvedValue(null),
      setLinkedPurchasesActiveForDocument: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldDocumentService,
        {
          provide: getRepositoryToken(GoldDocument),
          useValue: documentsRepo,
        },
        {
          provide: ObjectStorageService,
          useValue: storage,
        },
        {
          provide: GoldExtractionService,
          useValue: extractionService,
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(
              async (fn: (manager: typeof transactionManager) => unknown) =>
                fn(transactionManager),
            ),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'PUBLIC_APP_URL' ? 'https://api.example.com' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(GoldDocumentService);
  });

  const uploadFile = (buffer: Buffer, mimetype: string) => ({
    originalname: 'receipt.png',
    mimetype,
    size: buffer.length,
    buffer,
  });

  it('uploads a valid document and stores metadata', async () => {
    documentsRepo.findOne.mockResolvedValue(null);
    documentsRepo.save.mockImplementation(async (row: GoldDocument) => ({
      ...row,
      id: row.id ?? 'doc-new',
      createdAt: now,
      updatedAt: now,
    }));

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.duplicate).toBe(false);
    expect(result.restored).toBe(false);
    expect(result.document.extractionStatus).toBe('UPLOADED');
    expect(result.document.originalFileName).toBe('receipt.png');
    expect(result.document.fileUrl).toMatch(
      /^https:\/\/api\.example\.com\/gold\/documents\/[0-9a-f-]+\/file$/,
    );
    expect(extractionService.processDocumentExtraction).toHaveBeenCalledTimes(
      1,
    );
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(storage.putObject.mock.calls[0][0].key).toMatch(
      /^gold\/user-a\/[0-9a-f-]+\/\d+-[0-9a-f-]+\.png$/,
    );
    expect(documentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        mimeType: 'image/png',
        extractionStatus: 'UPLOADED',
        isActive: true,
        sha256Hash: expect.any(String),
      }),
    );
  });

  it('returns duplicate=true for same user and identical bytes without second S3 put', async () => {
    const existing = document();
    documentsRepo.findOne.mockResolvedValue(existing);

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.duplicate).toBe(true);
    expect(result.restored).toBe(false);
    expect(result.document.id).toBe('doc-1');
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(documentsRepo.save).not.toHaveBeenCalled();
  });

  it('restores soft-deleted document on re-upload with same bytes', async () => {
    const deleted = document({
      isActive: false,
      extractionStatus: 'EXTRACTED',
    });
    documentsRepo.findOne.mockResolvedValue(deleted);
    transactionManager.findOne.mockResolvedValue(deleted);
    extractionService.countItemsForDocuments.mockResolvedValue(
      new Map([
        [
          'doc-1',
          {
            extractedItemCount: 2,
            confirmedItemCount: 1,
            rejectedItemCount: 0,
            pendingItemCount: 1,
          },
        ],
      ]),
    );
    extractionService.findItemsByDocumentId.mockResolvedValue([
      { id: 'item-1', status: 'CONFIRMED', gold_purchase_id: 'gp-1' },
    ]);

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.duplicate).toBe(false);
    expect(result.restored).toBe(true);
    expect(result.document.id).toBe('doc-1');
    expect(storage.objectExists).toHaveBeenCalledWith(deleted.storageKey);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(transactionManager.save).toHaveBeenCalledWith(
      GoldDocument,
      expect.objectContaining({
        id: 'doc-1',
        isActive: true,
        extractionStatus: 'EXTRACTED',
        originalFileName: 'receipt.png',
      }),
    );
    expect(
      extractionService.setLinkedPurchasesActiveForDocument,
    ).toHaveBeenCalledWith('user-a', 'doc-1', true, transactionManager);
    expect(extractionService.processDocumentExtraction).not.toHaveBeenCalled();
  });

  it('re-uploads S3 object when soft-deleted document storage is missing', async () => {
    const deleted = document({ isActive: false });
    documentsRepo.findOne.mockResolvedValue(deleted);
    transactionManager.findOne.mockResolvedValue(deleted);
    storage.objectExists.mockResolvedValue(false);

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.restored).toBe(true);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(storage.putObject.mock.calls[0][0].key).toMatch(
      /^gold\/user-a\/doc-1\//,
    );
    expect(transactionManager.save).toHaveBeenCalledWith(
      GoldDocument,
      expect.objectContaining({
        id: 'doc-1',
        isActive: true,
        storageKey: expect.stringMatching(/^gold\/user-a\/doc-1\//),
      }),
    );
  });

  it('normalizes stale EXTRACTING status to EXTRACTED when items exist on restore', async () => {
    const deleted = document({
      isActive: false,
      extractionStatus: 'EXTRACTING',
    });
    documentsRepo.findOne.mockResolvedValue(deleted);
    transactionManager.findOne.mockResolvedValue(deleted);
    extractionService.countItemsForDocuments.mockResolvedValue(
      new Map([
        [
          'doc-1',
          {
            extractedItemCount: 1,
            confirmedItemCount: 0,
            rejectedItemCount: 0,
            pendingItemCount: 1,
          },
        ],
      ]),
    );

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.restored).toBe(true);
    expect(result.document.extractionStatus).toBe('EXTRACTED');
  });

  it('normalizes stale EXTRACTING status to UPLOADED when no items exist on restore', async () => {
    const deleted = document({
      isActive: false,
      extractionStatus: 'EXTRACTING',
    });
    documentsRepo.findOne.mockResolvedValue(deleted);
    transactionManager.findOne.mockResolvedValue(deleted);

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.restored).toBe(true);
    expect(result.document.extractionStatus).toBe('UPLOADED');
    expect(extractionService.processDocumentExtraction).toHaveBeenCalledWith(
      'user-a',
      'doc-1',
    );
  });

  it('preserves FAILED extraction status on restore', async () => {
    const deleted = document({
      isActive: false,
      extractionStatus: 'FAILED',
      extractionError: 'NO_PURCHASE_ROWS_FOUND',
    });
    documentsRepo.findOne.mockResolvedValue(deleted);
    transactionManager.findOne.mockResolvedValue(deleted);

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.restored).toBe(true);
    expect(result.document.extractionStatus).toBe('FAILED');
    expect(extractionService.processDocumentExtraction).not.toHaveBeenCalled();
  });

  it('soft-deletes document and deactivates linked purchases without removing S3 object', async () => {
    const active = document();
    transactionManager.findOne.mockResolvedValue(active);

    const ok = await service.deleteDocument('user-a', 'doc-1');

    expect(ok).toBe(true);
    expect(transactionManager.save).toHaveBeenCalledWith(
      GoldDocument,
      expect.objectContaining({ id: 'doc-1', isActive: false }),
    );
    expect(
      extractionService.setLinkedPurchasesActiveForDocument,
    ).toHaveBeenCalledWith('user-a', 'doc-1', false, transactionManager);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('delete is idempotent for already soft-deleted documents', async () => {
    transactionManager.findOne.mockResolvedValue(document({ isActive: false }));

    const ok = await service.deleteDocument('user-a', 'doc-1');

    expect(ok).toBe(true);
    expect(transactionManager.save).not.toHaveBeenCalled();
    expect(
      extractionService.setLinkedPurchasesActiveForDocument,
    ).not.toHaveBeenCalled();
  });

  it('allows the same hash for different users', async () => {
    documentsRepo.findOne.mockResolvedValue(null);
    documentsRepo.save.mockImplementation(async (row: GoldDocument) => ({
      ...row,
      id: 'doc-user-b',
      createdAt: now,
      updatedAt: now,
    }));

    await service.uploadDocument('user-b', uploadFile(PNG_BYTES, 'image/png'));

    expect(documentsRepo.findOne).toHaveBeenCalledWith({
      where: {
        userId: 'user-b',
        sha256Hash: expect.any(String),
      },
    });
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it('handles unique-constraint race by cleaning up S3 and returning duplicate', async () => {
    const existing = document();
    documentsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    documentsRepo.save.mockRejectedValue(
      Object.assign(new QueryFailedError('', [], new Error()), {
        driverError: { code: '23505' },
      }),
    );

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.duplicate).toBe(true);
    expect(result.restored).toBe(false);
    expect(result.document.id).toBe('doc-1');
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('handles unique-constraint race by restoring soft-deleted row', async () => {
    const deleted = document({
      isActive: false,
      extractionStatus: 'EXTRACTED',
    });
    documentsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(deleted);
    transactionManager.findOne.mockResolvedValue(deleted);
    documentsRepo.save
      .mockRejectedValueOnce(
        Object.assign(new QueryFailedError('', [], new Error()), {
          driverError: { code: '23505' },
        }),
      )
      .mockImplementationOnce(async (row: GoldDocument) => row);
    extractionService.countItemsForDocuments.mockResolvedValue(
      new Map([
        [
          'doc-1',
          {
            extractedItemCount: 1,
            confirmedItemCount: 0,
            rejectedItemCount: 0,
            pendingItemCount: 1,
          },
        ],
      ]),
    );

    const result = await service.uploadDocument(
      'user-a',
      uploadFile(PNG_BYTES, 'image/png'),
    );

    expect(result.restored).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('cleans up S3 when DB save fails for non-duplicate errors', async () => {
    documentsRepo.findOne.mockResolvedValue(null);
    documentsRepo.save.mockRejectedValue(new Error('db down'));

    await expect(
      service.uploadDocument('user-a', uploadFile(PNG_BYTES, 'image/png')),
    ).rejects.toThrow('db down');
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('does not persist DB record when S3 put fails', async () => {
    documentsRepo.findOne.mockResolvedValue(null);
    storage.putObject.mockRejectedValue(
      new InternalServerErrorException('Failed to upload file.'),
    );

    await expect(
      service.uploadDocument('user-a', uploadFile(PNG_BYTES, 'image/png')),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(documentsRepo.save).not.toHaveBeenCalled();
  });

  it('rejects unsupported mime types', async () => {
    await expect(
      service.uploadDocument(
        'user-a',
        uploadFile(ZIP_BYTES, 'application/zip'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejects mime spoofing', async () => {
    await expect(
      service.uploadDocument('user-a', uploadFile(PNG_BYTES, 'image/jpeg')),
    ).rejects.toThrow('File content does not match the declared type.');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejects oversized files', async () => {
    const huge = Buffer.alloc(16 * 1024 * 1024, 0);
    huge.writeUInt8(0x89, 0);
    huge.writeUInt8(0x50, 1);
    huge.writeUInt8(0x4e, 2);
    huge.writeUInt8(0x47, 3);
    huge.writeUInt8(0x0d, 4);
    huge.writeUInt8(0x0a, 5);
    huge.writeUInt8(0x1a, 6);
    huge.writeUInt8(0x0a, 7);

    await expect(
      service.uploadDocument('user-a', {
        originalname: 'big.png',
        mimetype: 'image/png',
        size: huge.length,
        buffer: huge,
      }),
    ).rejects.toThrow('Document too large');
  });

  it('scopes metadata lookup to owner via active filter', async () => {
    documentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findDocumentById('user-b', 'doc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(documentsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'doc-1', userId: 'user-b', isActive: true },
    });
  });

  it('returns not found for missing metadata', async () => {
    documentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findDocumentById('user-a', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only active documents newest first for the authenticated user', async () => {
    documentsRepo.find.mockResolvedValue([
      document({
        id: 'doc-2',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      }),
      document({ id: 'doc-1', createdAt: now }),
    ]);

    const rows = await service.findMyDocuments('user-a');

    expect(documentsRepo.find).toHaveBeenCalledWith({
      where: { userId: 'user-a', isActive: true },
      order: { createdAt: 'DESC' },
    });
    expect(rows.map((row) => row.id)).toEqual(['doc-2', 'doc-1']);
  });

  it('streams file only for active owner documents', async () => {
    documentsRepo.findOne.mockResolvedValue(null);
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      headersSent: false,
    };

    await service.streamDocumentFileToResponse('user-b', 'doc-1', res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(storage.streamObjectToResponse).not.toHaveBeenCalled();
    expect(documentsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'doc-1', userId: 'user-b', isActive: true },
    });
  });
});
