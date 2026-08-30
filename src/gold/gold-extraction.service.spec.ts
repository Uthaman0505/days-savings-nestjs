import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { ObjectStorageService } from '../storage/object-storage.service';
import { PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE } from './extraction/fixtures/public-gold-proforma.fixture';
import { extractTextFromPdfBuffer } from './extraction/pdf-text.extractor';
import { GoldDocument } from './gold-document.entity';
import { GoldExtractionItem } from './gold-extraction-item.entity';
import { GoldExtractionService } from './gold-extraction.service';
import { GoldService } from './gold.service';
import { GoldPurchase } from './gold-purchase.entity';
import { GoldPrice } from './gold-price.entity';

jest.mock('./extraction/pdf-text.extractor', () => ({
  extractTextFromPdfBuffer: jest.fn(),
  PdfTextExtractionError: class PdfTextExtractionError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
}));

const mockedExtractText = extractTextFromPdfBuffer as jest.MockedFunction<
  typeof extractTextFromPdfBuffer
>;

const MULTI_ROW_FIXTURE = [
  {
    purchaseDate: '2026-06-02',
    weightGrams: '0.5000',
    amountPaidCents: 28000,
    referenceNumber: 'PG-A001',
  },
  {
    purchaseDate: '2026-07-15',
    weightGrams: '0.3000',
    amountPaidCents: 17100,
    referenceNumber: 'PG-A002',
  },
  {
    purchaseDate: '2026-08-26',
    weightGrams: '0.3686',
    amountPaidCents: 21000,
    referenceNumber: 'PG-A003',
  },
] as const;

describe('GoldExtractionService', () => {
  let service: GoldExtractionService;
  let documentsRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let itemsRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      update: jest.Mock;
      delete: jest.Mock;
      save: jest.Mock;
      findOne: jest.Mock;
      getRepository: jest.Mock;
    };
  };
  let dataSource: { createQueryRunner: jest.Mock };
  let storage: { getObjectBuffer: jest.Mock };
  let goldService: {
    createPurchaseEntity: jest.Mock;
    findPurchaseById: jest.Mock;
    findLogicalDuplicateWarnings: jest.Mock;
  };

  const now = new Date('2026-08-30T00:00:00.000Z');

  const document = (overrides: Partial<GoldDocument> = {}): GoldDocument =>
    ({
      id: 'doc-1',
      userId: 'user-a',
      originalFileName: 'history.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 1000,
      storageKey: 'gold/user-a/doc-1/file.pdf',
      sha256Hash: 'abc123',
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
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn(),
        findOne: jest.fn(),
        getRepository: jest.fn(() => ({
          count: jest.fn().mockResolvedValue(0),
          update: jest.fn().mockResolvedValue(undefined),
        })),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    documentsRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    itemsRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(
        (x: Partial<GoldExtractionItem>) => x as GoldExtractionItem,
      ),
      save: jest.fn(async (x: GoldExtractionItem) => x),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };

    storage = {
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    };

    goldService = {
      createPurchaseEntity: jest.fn(),
      findPurchaseById: jest.fn(),
      findLogicalDuplicateWarnings: jest.fn().mockResolvedValue([]),
    };

    mockedExtractText.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldExtractionService,
        { provide: getRepositoryToken(GoldDocument), useValue: documentsRepo },
        {
          provide: getRepositoryToken(GoldExtractionItem),
          useValue: itemsRepo,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: ObjectStorageService, useValue: storage },
        { provide: GoldService, useValue: goldService },
      ],
    }).compile();

    service = module.get(GoldExtractionService);
  });

  it('creates three extraction items for the multi-row fixture', async () => {
    documentsRepo.findOne.mockResolvedValue(document());
    queryRunner.manager.save.mockImplementation(
      async (entity: typeof GoldExtractionItem, rows: GoldExtractionItem[]) =>
        rows.map((row, index) => ({
          ...row,
          id: `item-${index}`,
          createdAt: now,
          updatedAt: now,
        })),
    );

    const items = await service.processStubExtraction('user-a', 'doc-1', [
      ...MULTI_ROW_FIXTURE,
    ]);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.rowIndex)).toEqual([0, 1, 2]);
    expect(items.every((item) => item.goldDocumentId === 'doc-1')).toBe(true);
    expect(items.every((item) => item.userId === 'user-a')).toBe(true);
    expect(items.every((item) => !item.goldPurchaseId)).toBe(true);
    expect(items[0].weightGrams).toBe('0.5000');
    expect(items[1].weightGrams).toBe('0.3000');
    expect(items[2].weightGrams).toBe('0.3686');
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      GoldDocument,
      { id: 'doc-1' },
      { extractionStatus: 'EXTRACTING', extractionError: null },
    );
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      GoldDocument,
      { id: 'doc-1' },
      expect.objectContaining({ extractionStatus: 'EXTRACTED' }),
    );
  });

  it('processes a Public Gold PDF into one extraction item', async () => {
    documentsRepo.findOne.mockResolvedValue(document());
    mockedExtractText.mockResolvedValue(PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE);
    queryRunner.manager.save.mockImplementation(
      async (_entity: typeof GoldExtractionItem, rows: GoldExtractionItem[]) =>
        rows.map((row, index) => ({
          ...row,
          id: `item-${index}`,
          createdAt: now,
          updatedAt: now,
        })),
    );

    const items = await service.processDocumentExtraction('user-a', 'doc-1');

    expect(items).not.toBeNull();
    expect(items).toHaveLength(1);
    expect(items![0].rowIndex).toBe(0);
    expect(items![0].purchaseDate).toBe('2026-08-26');
    expect(items![0].weightGrams).toBe('0.1529');
    expect(items![0].amountPaidCents).toBe(10000);
    expect(items![0].pricePerGramCents).toBe(65400);
    expect(items![0].referenceNumber).toBe('21727607');
    expect(items![0].goldPurchaseId).toBeFalsy();
    expect(storage.getObjectBuffer).toHaveBeenCalledWith(
      'gold/user-a/doc-1/file.pdf',
    );
  });

  it('marks image uploads as OCR_NOT_IMPLEMENTED', async () => {
    documentsRepo.findOne.mockResolvedValue(
      document({ mimeType: 'image/png', originalFileName: 'scan.png' }),
    );

    const items = await service.processDocumentExtraction('user-a', 'doc-1');

    expect(items).toBeNull();
    expect(documentsRepo.update).toHaveBeenCalledWith('doc-1', {
      extractionStatus: 'FAILED',
      extractionError: 'OCR_NOT_IMPLEMENTED',
    });
  });

  it('marks document FAILED when save throws', async () => {
    documentsRepo.findOne.mockResolvedValue(document());
    queryRunner.manager.save.mockRejectedValue(new Error('db save failed'));

    await expect(
      service.processStubExtraction('user-a', 'doc-1', [MULTI_ROW_FIXTURE[0]]),
    ).rejects.toThrow('db save failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(documentsRepo.update).toHaveBeenCalledWith('doc-1', {
      extractionStatus: 'FAILED',
      extractionError: 'EXTRACTION_FAILED',
    });
  });

  it('rejects cross-user document processing', async () => {
    documentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.processStubExtraction('user-b', 'doc-1', [MULTI_ROW_FIXTURE[0]]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing document', async () => {
    documentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.processStubExtraction('user-a', 'missing', [
        MULTI_ROW_FIXTURE[0],
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks re-extraction when confirmed items exist', async () => {
    documentsRepo.findOne.mockResolvedValue(document());
    itemsRepo.count.mockResolvedValue(1);

    await expect(
      service.processStubExtraction('user-a', 'doc-1', [MULTI_ROW_FIXTURE[0]]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks re-extraction when items are linked to purchases', async () => {
    documentsRepo.findOne.mockResolvedValue(document());
    itemsRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'item-linked' }),
    });

    await expect(
      service.processStubExtraction('user-a', 'doc-1', [MULTI_ROW_FIXTURE[0]]),
    ).rejects.toThrow('linked to purchases');
  });

  it('allows safe re-extraction by replacing prior non-confirmed items', async () => {
    documentsRepo.findOne.mockResolvedValue(
      document({ extractionStatus: 'EXTRACTED' }),
    );
    queryRunner.manager.save.mockImplementation(
      async (_entity: typeof GoldExtractionItem, rows: GoldExtractionItem[]) =>
        rows.map((row, index) => ({
          ...row,
          id: `item-new-${index}`,
          createdAt: now,
          updatedAt: now,
        })),
    );

    await service.processStubExtraction('user-a', 'doc-1', [
      MULTI_ROW_FIXTURE[0],
    ]);

    expect(queryRunner.manager.delete).toHaveBeenCalledWith(
      GoldExtractionItem,
      {
        goldDocumentId: 'doc-1',
      },
    );
  });

  it('scopes item lookup to owner', async () => {
    documentsRepo.findOne.mockResolvedValue(document());
    itemsRepo.find.mockResolvedValue([]);

    await service.findItemsByDocumentId('user-a', 'doc-1');

    expect(itemsRepo.find).toHaveBeenCalledWith({
      where: { goldDocumentId: 'doc-1', userId: 'user-a' },
      order: { rowIndex: 'ASC' },
    });
  });

  it('computes document item counts', async () => {
    itemsRepo.find.mockResolvedValue([
      { goldDocumentId: 'doc-1', status: 'DETECTED' },
      { goldDocumentId: 'doc-1', status: 'NEEDS_REVIEW' },
    ]);

    const counts = await service.countItemsForDocuments('user-a', ['doc-1']);

    expect(counts.get('doc-1')).toEqual({
      extractedItemCount: 2,
      confirmedItemCount: 0,
      rejectedItemCount: 0,
      pendingItemCount: 2,
    });
  });

  describe('confirmExtractionItem', () => {
    const extractionItem = (
      overrides: Partial<GoldExtractionItem> = {},
    ): GoldExtractionItem =>
      ({
        id: 'item-1',
        goldDocumentId: 'doc-1',
        userId: 'user-a',
        rowIndex: 0,
        status: 'NEEDS_REVIEW',
        purchaseDate: '2026-08-26',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
        referenceNumber: '21727607',
        confidence: '0.9500',
        rawFields: { extractionSource: 'IMPORT' },
        validationWarnings: [],
        goldPurchaseId: null,
        confirmedAt: null,
        rejectedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      }) as GoldExtractionItem;

    const confirmInput = {
      extraction_item_id: 'item-1',
      purchase_date: '2026-08-26',
      weight_grams: '0.1529',
      amount_paid_cents: 10000,
      price_per_gram_cents: 65400,
      reference_number: '21727607',
    };

    beforeEach(() => {
      queryRunner.manager.findOne = jest.fn();
      queryRunner.manager.save = jest.fn();
    });

    it('creates a purchase and links the extraction item', async () => {
      const item = extractionItem();
      queryRunner.manager.findOne.mockResolvedValue(item);
      goldService.createPurchaseEntity.mockResolvedValue({
        id: 'gp-new',
        userId: 'user-a',
        purchaseDate: '2026-08-26',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
        source: 'IMPORT',
        referenceNumber: '21727607',
        notes: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      queryRunner.manager.save.mockImplementation(
        async (_entity: typeof GoldExtractionItem, row: GoldExtractionItem) =>
          row,
      );
      goldService.findPurchaseById.mockResolvedValue({
        id: 'gp-new',
        userId: 'user-a',
        purchaseDate: '2026-08-26',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
        source: 'IMPORT',
        referenceNumber: '21727607',
        notes: null,
        isActive: true,
        currentValueCents: null,
        unrealizedPlCents: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.confirmExtractionItem(
        'user-a',
        confirmInput,
      );

      expect(goldService.createPurchaseEntity).toHaveBeenCalledWith(
        'user-a',
        expect.objectContaining({
          purchase_date: '2026-08-26',
          weight_grams: '0.1529',
        }),
        'IMPORT',
        queryRunner.manager,
      );
      expect(result.purchase.id).toBe('gp-new');
      expect(result.extractionItem.status).toBe('CONFIRMED');
      expect(result.extractionItem.goldPurchaseId).toBe('gp-new');
      expect(result.warnings).toEqual([]);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('returns existing purchase on idempotent re-confirm', async () => {
      const item = extractionItem({
        status: 'CONFIRMED',
        goldPurchaseId: 'gp-existing',
        confirmedAt: now,
      });
      queryRunner.manager.findOne.mockResolvedValue(item);
      goldService.findPurchaseById.mockResolvedValue({
        id: 'gp-existing',
        userId: 'user-a',
        purchaseDate: '2026-08-26',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
        source: 'IMPORT',
        referenceNumber: '21727607',
        notes: null,
        isActive: true,
        currentValueCents: null,
        unrealizedPlCents: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.confirmExtractionItem(
        'user-a',
        confirmInput,
      );

      expect(goldService.createPurchaseEntity).not.toHaveBeenCalled();
      expect(result.purchase.id).toBe('gp-existing');
      expect(result.extractionItem.status).toBe('CONFIRMED');
    });

    it('rejects confirm for another user item', async () => {
      queryRunner.manager.findOne.mockResolvedValue(
        extractionItem({ userId: 'user-a' }),
      );

      await expect(
        service.confirmExtractionItem('user-b', confirmInput),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('rejects confirm for rejected items', async () => {
      queryRunner.manager.findOne.mockResolvedValue(
        extractionItem({ status: 'REJECTED', rejectedAt: now }),
      );

      await expect(
        service.confirmExtractionItem('user-a', confirmInput),
      ).rejects.toThrow('rejected extraction item');
    });

    it('returns logical duplicate warnings without blocking', async () => {
      const item = extractionItem();
      queryRunner.manager.findOne.mockResolvedValue(item);
      goldService.createPurchaseEntity.mockResolvedValue({
        id: 'gp-new',
        userId: 'user-a',
        purchaseDate: '2026-08-26',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
        source: 'IMPORT',
        referenceNumber: '21727607',
        notes: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      queryRunner.manager.save.mockImplementation(
        async (_entity: typeof GoldExtractionItem, row: GoldExtractionItem) =>
          row,
      );
      goldService.findLogicalDuplicateWarnings.mockResolvedValue([
        'LOGICAL_DUPLICATE_REFERENCE',
      ]);
      goldService.findPurchaseById.mockResolvedValue({
        id: 'gp-new',
        userId: 'user-a',
        purchaseDate: '2026-08-26',
        weightGrams: '0.1529',
        amountPaidCents: 10000,
        pricePerGramCents: 65400,
        source: 'IMPORT',
        referenceNumber: '21727607',
        notes: null,
        isActive: true,
        currentValueCents: null,
        unrealizedPlCents: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.confirmExtractionItem(
        'user-a',
        confirmInput,
      );

      expect(result.warnings).toEqual(['LOGICAL_DUPLICATE_REFERENCE']);
      expect(result.purchase.id).toBe('gp-new');
    });
  });

  describe('rejectExtractionItem', () => {
    it('marks a pending item as rejected', async () => {
      itemsRepo.findOne.mockResolvedValue({
        id: 'item-1',
        goldDocumentId: 'doc-1',
        userId: 'user-a',
        rowIndex: 0,
        status: 'NEEDS_REVIEW',
        goldPurchaseId: null,
        confirmedAt: null,
        rejectedAt: null,
        validationWarnings: [],
        createdAt: now,
        updatedAt: now,
      });
      itemsRepo.save.mockImplementation(async (row: GoldExtractionItem) => row);

      const result = await service.rejectExtractionItem('user-a', {
        extraction_item_id: 'item-1',
      });

      expect(result.status).toBe('REJECTED');
      expect(result.rejectedAt).toBeInstanceOf(Date);
    });

    it('is idempotent for already rejected items', async () => {
      itemsRepo.findOne.mockResolvedValue({
        id: 'item-1',
        goldDocumentId: 'doc-1',
        userId: 'user-a',
        rowIndex: 0,
        status: 'REJECTED',
        rejectedAt: now,
        validationWarnings: [],
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.rejectExtractionItem('user-a', {
        extraction_item_id: 'item-1',
      });

      expect(result.status).toBe('REJECTED');
      expect(itemsRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('GoldExtractionService linked purchase lifecycle', () => {
  let service: GoldExtractionService;
  let manager: {
    find: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    manager = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldExtractionService,
        {
          provide: getRepositoryToken(GoldDocument),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(GoldExtractionItem),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: ObjectStorageService,
          useValue: { getObjectBuffer: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn() },
        },
        {
          provide: GoldService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(GoldExtractionService);
  });

  it('deactivates only purchases linked via confirmed extraction items', async () => {
    manager.find.mockResolvedValue([
      { goldPurchaseId: 'gp-1' },
      { goldPurchaseId: 'gp-2' },
      { goldPurchaseId: 'gp-1' },
    ]);

    const count = await service.setLinkedPurchasesActiveForDocument(
      'user-a',
      'doc-1',
      false,
      manager as never,
    );

    expect(count).toBe(1);
    expect(manager.find).toHaveBeenCalledWith(GoldExtractionItem, {
      where: {
        goldDocumentId: 'doc-1',
        userId: 'user-a',
        status: 'CONFIRMED',
      },
      select: ['goldPurchaseId'],
    });
    expect(manager.update).toHaveBeenCalledWith(
      GoldPurchase,
      expect.objectContaining({ userId: 'user-a' }),
      { isActive: false },
    );
  });

  it('reactivates linked purchases on restore', async () => {
    manager.find.mockResolvedValue([{ goldPurchaseId: 'gp-1' }]);

    await service.setLinkedPurchasesActiveForDocument(
      'user-a',
      'doc-1',
      true,
      manager as never,
    );

    expect(manager.update).toHaveBeenCalledWith(
      GoldPurchase,
      { userId: 'user-a', id: expect.anything() },
      { isActive: true },
    );
  });

  it('does nothing when document has no confirmed linked purchases', async () => {
    manager.find.mockResolvedValue([]);

    const count = await service.setLinkedPurchasesActiveForDocument(
      'user-a',
      'doc-1',
      false,
      manager as never,
    );

    expect(count).toBe(0);
    expect(manager.update).not.toHaveBeenCalled();
  });
});

describe('GoldExtractionService portfolio isolation', () => {
  it('does not create or modify GoldPurchase records during stub extraction', async () => {
    const purchasesRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'gp-1',
          userId: 'user-a',
          purchaseDate: '2026-08-01',
          weightGrams: '10.0000',
          amountPaidCents: 500000,
          pricePerGramCents: 50000,
          source: 'MANUAL',
          referenceNumber: null,
          notes: null,
          isActive: true,
          createdAt: new Date('2026-08-29T00:00:00.000Z'),
          updatedAt: new Date('2026-08-29T00:00:00.000Z'),
        },
      ]),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const pricesRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => pricesRepo.findOne()),
      })),
    };

    const goldServiceModule = await Test.createTestingModule({
      providers: [
        GoldService,
        { provide: getRepositoryToken(GoldPurchase), useValue: purchasesRepo },
        { provide: getRepositoryToken(GoldPrice), useValue: pricesRepo },
      ],
    }).compile();
    const goldService = goldServiceModule.get(GoldService);

    const dashboardBefore = await goldService.getDashboard('user-a');

    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn(async (_entity: unknown, rows: GoldExtractionItem[]) =>
          rows.map((row, index) => ({
            ...row,
            id: `item-${index}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        ),
      },
    } as unknown as QueryRunner;

    const extractionModule = await Test.createTestingModule({
      providers: [
        GoldExtractionService,
        {
          provide: getRepositoryToken(GoldDocument),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'doc-1',
              userId: 'user-a',
            }),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(GoldExtractionItem),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn(
              (x: Partial<GoldExtractionItem>) => x as GoldExtractionItem,
            ),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            })),
          },
        },
        {
          provide: DataSource,
          useValue: { createQueryRunner: () => queryRunner },
        },
        {
          provide: ObjectStorageService,
          useValue: { getObjectBuffer: jest.fn() },
        },
        {
          provide: GoldService,
          useValue: {
            createPurchaseEntity: jest.fn(),
            findPurchaseById: jest.fn(),
            findLogicalDuplicateWarnings: jest.fn(),
          },
        },
      ],
    }).compile();

    const extractionService = extractionModule.get(GoldExtractionService);
    await extractionService.processStubExtraction('user-a', 'doc-1', [
      ...MULTI_ROW_FIXTURE,
    ]);

    const dashboardAfter = await goldService.getDashboard('user-a');

    expect(purchasesRepo.save).not.toHaveBeenCalled();
    expect(purchasesRepo.create).not.toHaveBeenCalled();
    expect(dashboardBefore.totalGrams).toBe('10.0000');
    expect(dashboardAfter.totalGrams).toBe('10.0000');
    expect(dashboardAfter.totalInvestedCents).toBe(
      dashboardBefore.totalInvestedCents,
    );
  });
});
