import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let repo: jest.Mocked<
    Pick<
      Repository<Category>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  >;

  const baseCategory = (overrides: Partial<Category> = {}): Category =>
    ({
      id: 'cat-1',
      userId: 'user-1',
      name: 'Coffee',
      description: null,
      type: 'EXPENSE',
      icon: null,
      color: null,
      displayOrder: 0,
      isDefault: false,
      isSystem: false,
      isArchived: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Category;

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Category),
      save: jest.fn(async (x) => {
        if (Array.isArray(x)) {
          return x.map((row, i) => ({
            ...row,
            id: row.id ?? `seed-${i}`,
            createdAt: row.createdAt ?? new Date(),
            updatedAt: row.updatedAt ?? new Date(),
          })) as Category[];
        }
        const entity = x as Category;
        return {
          ...entity,
          id: entity.id ?? 'cat-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as Category;
      }),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: getRepositoryToken(Category), useValue: repo },
      ],
    }).compile();

    service = module.get(CategoryService);
  });

  it('seeds system categories idempotently on init', async () => {
    repo.find.mockResolvedValue([]);

    await service.onModuleInit();

    expect(repo.save).toHaveBeenCalled();
    const saved = repo.save.mock.calls[0][0] as Category[];
    expect(Array.isArray(saved)).toBe(true);
    expect(saved.length).toBeGreaterThan(10);
    expect(saved.every((row) => row.isSystem === true)).toBe(true);
    expect(saved.every((row) => row.userId === null)).toBe(true);
  });

  it('creates a user category', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      name: '  Coffee  ',
      type: 'EXPENSE',
      color: '#ff0000',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        name: 'Coffee',
        type: 'EXPENSE',
        isSystem: false,
        isArchived: false,
      }),
    );
    expect(result.name).toBe('Coffee');
  });

  it('rejects duplicate user category name for the same type', async () => {
    repo.findOne.mockResolvedValue(baseCategory());

    await expect(
      service.create('user-1', { name: 'Coffee', type: 'EXPENSE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids editing system categories', async () => {
    repo.findOne.mockResolvedValue(
      baseCategory({
        userId: null,
        isSystem: true,
        name: 'Salary',
        type: 'INCOME',
      }),
    );

    await expect(
      service.update('user-1', 'cat-1', { name: 'Pay' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('archives a user category', async () => {
    repo.findOne.mockResolvedValue(baseCategory());

    const result = await service.archive('user-1', 'cat-1');

    expect(result.isArchived).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isArchived: true }),
    );
  });

  it('restores an archived user category', async () => {
    repo.findOne.mockResolvedValue(baseCategory({ isArchived: true }));

    const result = await service.restore('user-1', 'cat-1');

    expect(result.isArchived).toBe(false);
  });

  it('deletes an unreferenced user category', async () => {
    const row = baseCategory();
    repo.findOne.mockResolvedValue(row);
    repo.remove.mockResolvedValue(row);

    await expect(service.delete('user-1', 'cat-1')).resolves.toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });

  it('rejects assignable check for archived categories', async () => {
    repo.findOne.mockResolvedValue(baseCategory({ isArchived: true }));

    await expect(
      service.assertAssignable('cat-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found for missing category', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists categories by type including system and user rows', async () => {
    repo.find
      .mockResolvedValueOnce([
        baseCategory({
          id: 'sys-1',
          userId: null,
          isSystem: true,
          name: 'Groceries',
        }),
      ])
      .mockResolvedValueOnce([baseCategory({ id: 'u-1', name: 'Coffee' })]);

    const rows = await service.findByType('user-1', 'EXPENSE');

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Groceries');
    expect(rows[1].name).toBe('Coffee');
  });
});
