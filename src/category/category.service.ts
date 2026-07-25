import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Category, CategoryType } from './category.entity';
import { CreateCategoryInput } from './dto/create-category.input';
import { UpdateCategoryInput } from './dto/update-category.input';
import { CategoryModel } from './models/category.model';

type SeedCategory = {
  name: string;
  type: CategoryType;
  displayOrder: number;
  description?: string;
};

const DEFAULT_SYSTEM_CATEGORIES: SeedCategory[] = [
  // Income
  { name: 'Salary', type: 'INCOME', displayOrder: 10 },
  { name: 'Bonus', type: 'INCOME', displayOrder: 20 },
  { name: 'Commission', type: 'INCOME', displayOrder: 30 },
  { name: 'Interest', type: 'INCOME', displayOrder: 40 },
  { name: 'Dividend', type: 'INCOME', displayOrder: 50 },
  { name: 'Rental', type: 'INCOME', displayOrder: 60 },
  { name: 'Grab', type: 'INCOME', displayOrder: 70 },
  { name: 'Freelance', type: 'INCOME', displayOrder: 80 },
  // Expense
  { name: 'Food & Beverage', type: 'EXPENSE', displayOrder: 10 },
  { name: 'Groceries', type: 'EXPENSE', displayOrder: 20 },
  { name: 'Fuel', type: 'EXPENSE', displayOrder: 30 },
  { name: 'Transport', type: 'EXPENSE', displayOrder: 40 },
  { name: 'Parking', type: 'EXPENSE', displayOrder: 50 },
  { name: 'Toll', type: 'EXPENSE', displayOrder: 60 },
  { name: 'Utilities', type: 'EXPENSE', displayOrder: 70 },
  { name: 'Internet', type: 'EXPENSE', displayOrder: 80 },
  { name: 'Insurance', type: 'EXPENSE', displayOrder: 90 },
  { name: 'House Loan', type: 'EXPENSE', displayOrder: 100 },
  { name: 'Medical', type: 'EXPENSE', displayOrder: 110 },
  { name: 'Education', type: 'EXPENSE', displayOrder: 120 },
  { name: 'Shopping', type: 'EXPENSE', displayOrder: 130 },
  { name: 'Entertainment', type: 'EXPENSE', displayOrder: 140 },
  { name: 'Travel', type: 'EXPENSE', displayOrder: 150 },
  { name: 'Maintenance', type: 'EXPENSE', displayOrder: 160 },
  // Investment
  { name: 'Stocks', type: 'INVESTMENT', displayOrder: 10 },
  { name: 'ETF', type: 'INVESTMENT', displayOrder: 20 },
  { name: 'Crypto', type: 'INVESTMENT', displayOrder: 30 },
  // Saving
  { name: 'Emergency Fund', type: 'SAVING', displayOrder: 10 },
  { name: 'Vacation Fund', type: 'SAVING', displayOrder: 20 },
  { name: 'Retirement', type: 'SAVING', displayOrder: 30 },
  // Other
  { name: 'Miscellaneous', type: 'OTHER', displayOrder: 10 },
];

@Injectable()
export class CategoryService implements OnModuleInit {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedSystemCategories();
  }

  async findMyCategories(userId: string): Promise<CategoryModel[]> {
    const rows = await this.categoriesRepo.find({
      where: { userId },
      order: { type: 'ASC', displayOrder: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findSystemCategories(): Promise<CategoryModel[]> {
    const rows = await this.categoriesRepo.find({
      where: { isSystem: true, userId: IsNull() },
      order: { type: 'ASC', displayOrder: 'ASC', name: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByType(userId: string, type: string): Promise<CategoryModel[]> {
    const categoryType = this.requireCategoryType(type);
    const [systemRows, userRows] = await Promise.all([
      this.categoriesRepo.find({
        where: {
          type: categoryType,
          isSystem: true,
          isArchived: false,
          userId: IsNull(),
        },
        order: { displayOrder: 'ASC', name: 'ASC' },
      }),
      this.categoriesRepo.find({
        where: {
          type: categoryType,
          userId,
          isArchived: false,
        },
        order: { displayOrder: 'ASC', name: 'ASC' },
      }),
    ]);
    return [...systemRows, ...userRows].map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    categoryId: string,
  ): Promise<CategoryModel> {
    const row = await this.requireVisibleCategory(userId, categoryId);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateCategoryInput,
  ): Promise<CategoryModel> {
    const name = this.normalizeName(input.name);
    const type = this.requireCategoryType(input.type);
    await this.assertUniqueUserCategory(userId, type, name);

    const entity = this.categoriesRepo.create({
      userId,
      name,
      description: input.description?.trim() || null,
      type,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      displayOrder: input.display_order ?? 0,
      isDefault: input.is_default === true,
      isSystem: false,
      isArchived: false,
    });

    const saved = await this.categoriesRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryModel> {
    const category = await this.requireOwnedUserCategory(userId, categoryId);
    this.assertNotSystem(category);

    const nextType =
      input.type !== undefined
        ? this.requireCategoryType(input.type)
        : category.type;
    const nextName =
      input.name !== undefined ? this.normalizeName(input.name) : category.name;

    if (input.name !== undefined || input.type !== undefined) {
      await this.assertUniqueUserCategory(
        userId,
        nextType,
        nextName,
        categoryId,
      );
    }

    if (input.name !== undefined) category.name = nextName;
    if (input.type !== undefined) category.type = nextType;
    if (input.description !== undefined) {
      category.description =
        input.description === null ? null : input.description.trim() || null;
    }
    if (input.icon !== undefined) {
      category.icon = input.icon === null ? null : input.icon.trim() || null;
    }
    if (input.color !== undefined) {
      category.color = input.color === null ? null : input.color.trim() || null;
    }
    if (input.display_order !== undefined) {
      category.displayOrder = input.display_order;
    }
    if (input.is_default !== undefined) {
      category.isDefault = input.is_default;
    }

    const saved = await this.categoriesRepo.save(category);
    return this.toModel(saved);
  }

  async archive(userId: string, categoryId: string): Promise<CategoryModel> {
    const category = await this.requireOwnedUserCategory(userId, categoryId);
    this.assertNotSystem(category);
    category.isArchived = true;
    const saved = await this.categoriesRepo.save(category);
    return this.toModel(saved);
  }

  async restore(userId: string, categoryId: string): Promise<CategoryModel> {
    const category = await this.requireOwnedUserCategory(userId, categoryId);
    this.assertNotSystem(category);
    category.isArchived = false;
    const saved = await this.categoriesRepo.save(category);
    return this.toModel(saved);
  }

  async delete(userId: string, categoryId: string): Promise<boolean> {
    const category = await this.requireOwnedUserCategory(userId, categoryId);
    this.assertNotSystem(category);

    const referenced = this.countTransactionReferences(categoryId);
    if (referenced > 0) {
      throw new BadRequestException(
        'Category cannot be deleted because it is referenced by transactions. Archive it instead.',
      );
    }

    await this.categoriesRepo.remove(category);
    return true;
  }

  /**
   * Future Income/Expense/Ledger modules should call this before assigning a category.
   * Archived categories must not be used on new transactions.
   */
  async assertAssignable(
    categoryId: string,
    userId: string,
  ): Promise<Category> {
    const category = await this.requireVisibleCategory(userId, categoryId);
    if (category.isArchived) {
      throw new BadRequestException(
        'Archived categories cannot be assigned to new transactions.',
      );
    }
    return category;
  }

  private async seedSystemCategories(): Promise<void> {
    try {
      const existing = await this.categoriesRepo.find({
        where: { isSystem: true, userId: IsNull() },
      });
      const byKey = new Map(
        existing.map((row) => [`${row.type}::${row.name}`, row]),
      );

      const toSave: Category[] = [];
      for (const seed of DEFAULT_SYSTEM_CATEGORIES) {
        const key = `${seed.type}::${seed.name}`;
        const current = byKey.get(key);
        if (!current) {
          toSave.push(
            this.categoriesRepo.create({
              userId: null,
              name: seed.name,
              description: seed.description ?? null,
              type: seed.type,
              icon: null,
              color: null,
              displayOrder: seed.displayOrder,
              isDefault: true,
              isSystem: true,
              isArchived: false,
            }),
          );
          continue;
        }

        const shouldUpdate =
          current.displayOrder !== seed.displayOrder ||
          current.isDefault !== true ||
          current.isSystem !== true ||
          current.isArchived !== false;

        if (shouldUpdate) {
          current.displayOrder = seed.displayOrder;
          current.isDefault = true;
          current.isSystem = true;
          current.isArchived = false;
          toSave.push(current);
        }
      }

      if (toSave.length > 0) {
        await this.categoriesRepo.save(toSave);
        this.logger.log(
          `Seeded/updated ${toSave.length} system categor(y/ies).`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Skipping system category seeding: ${(e as Error).message}`,
      );
    }
  }

  private async requireVisibleCategory(
    userId: string,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.categoriesRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    const isOwn = category.userId === userId;
    const isSystem = category.isSystem && category.userId === null;
    if (!isOwn && !isSystem) {
      throw new ForbiddenException('You do not own this category.');
    }
    return category;
  }

  private async requireOwnedUserCategory(
    userId: string,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.categoriesRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    if (category.isSystem || category.userId === null) {
      throw new ForbiddenException('System categories cannot be modified.');
    }
    if (category.userId !== userId) {
      throw new ForbiddenException('You do not own this category.');
    }
    return category;
  }

  private assertNotSystem(category: Category): void {
    if (category.isSystem) {
      throw new ForbiddenException(
        'System categories cannot be edited, archived, or deleted.',
      );
    }
  }

  private async assertUniqueUserCategory(
    userId: string,
    type: CategoryType,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.categoriesRepo.findOne({
      where: excludeId
        ? { userId, type, name, id: Not(excludeId) }
        : { userId, type, name },
    });
    if (existing) {
      throw new BadRequestException(
        'A category with this name already exists for this type.',
      );
    }

    const systemClash = await this.categoriesRepo.findOne({
      where: {
        userId: IsNull(),
        isSystem: true,
        type,
        name,
      },
    });
    if (systemClash) {
      throw new BadRequestException(
        'A system category with this name already exists for this type.',
      );
    }
  }

  /**
   * Hook for future finance documents that reference categories.
   * Returns 0 until Income/Expense/Ledger modules persist category_id FKs.
   */
  private countTransactionReferences(_categoryId: string): number {
    return 0;
  }

  private requireCategoryType(type: string): CategoryType {
    const allowed: CategoryType[] = [
      'INCOME',
      'EXPENSE',
      'TRANSFER',
      'LOAN',
      'INSURANCE',
      'SAVING',
      'INVESTMENT',
      'GOAL',
      'OTHER',
    ];
    if (!allowed.includes(type as CategoryType)) {
      throw new BadRequestException('Invalid category type.');
    }
    return type as CategoryType;
  }

  private normalizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Category name is required.');
    }
    return trimmed;
  }

  private toModel(row: Category): CategoryModel {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      type: row.type,
      icon: row.icon,
      color: row.color,
      displayOrder: row.displayOrder,
      isDefault: row.isDefault,
      isSystem: row.isSystem,
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as CategoryModel;
  }
}
