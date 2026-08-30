import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { GoldDocument } from './gold-document.entity';
import { GoldExtractionItem } from './gold-extraction-item.entity';
import { GoldExtractionService } from './gold-extraction.service';
import { GoldService } from './gold.service';
import { GoldPurchase } from './gold-purchase.entity';
import { GoldPrice } from './gold-price.entity';

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
    };
  };
  let dataSource: { createQueryRunner: jest.Mock };

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
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldExtractionService,
        { provide: getRepositoryToken(GoldDocument), useValue: documentsRepo },
        {
          provide: getRepositoryToken(GoldExtractionItem),
          useValue: itemsRepo,
        },
        { provide: DataSource, useValue: dataSource },
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
      { extractionStatus: 'EXTRACTED' },
    );
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
      extractionError: 'db save failed',
    });
  });

  it('rejects cross-user document processing', async () => {
    documentsRepo.findOne.mockResolvedValue(document({ userId: 'user-a' }));

    await expect(
      service.processStubExtraction('user-b', 'doc-1', [MULTI_ROW_FIXTURE[0]]),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
