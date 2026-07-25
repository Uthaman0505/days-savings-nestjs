import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { CategoryService } from './category.service';
import { ArchiveCategoryInput } from './dto/archive-category.input';
import { CreateCategoryInput } from './dto/create-category.input';
import { DeleteCategoryInput } from './dto/delete-category.input';
import { UpdateCategoryInput } from './dto/update-category.input';
import { CategoryModel } from './models/category.model';

@Resolver()
export class CategoryResolver {
  constructor(private readonly categoryService: CategoryService) {}

  @Query(() => [CategoryModel], { name: 'myCategories' })
  @UseGuards(JwtAuthGuard)
  myCategories(@CurrentUser() user: JwtUser): Promise<CategoryModel[]> {
    return this.categoryService.findMyCategories(user.id);
  }

  @Query(() => [CategoryModel], { name: 'systemCategories' })
  @UseGuards(JwtAuthGuard)
  systemCategories(): Promise<CategoryModel[]> {
    return this.categoryService.findSystemCategories();
  }

  @Query(() => [CategoryModel], { name: 'categoriesByType' })
  @UseGuards(JwtAuthGuard)
  categoriesByType(
    @CurrentUser() user: JwtUser,
    @Args('type', { type: () => String }) type: string,
  ): Promise<CategoryModel[]> {
    return this.categoryService.findByType(user.id, type);
  }

  @Query(() => CategoryModel, { name: 'categoryById' })
  @UseGuards(JwtAuthGuard)
  categoryById(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CategoryModel> {
    return this.categoryService.findByIdForUser(user.id, id);
  }

  @Mutation(() => CategoryModel, { name: 'createCategory' })
  @UseGuards(JwtAuthGuard)
  createCategory(
    @CurrentUser() user: JwtUser,
    @Args('input') input: CreateCategoryInput,
  ): Promise<CategoryModel> {
    return this.categoryService.create(user.id, input);
  }

  @Mutation(() => CategoryModel, { name: 'updateCategory' })
  @UseGuards(JwtAuthGuard)
  updateCategory(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateCategoryInput,
  ): Promise<CategoryModel> {
    return this.categoryService.update(user.id, id, input);
  }

  @Mutation(() => CategoryModel, { name: 'archiveCategory' })
  @UseGuards(JwtAuthGuard)
  archiveCategory(
    @CurrentUser() user: JwtUser,
    @Args('input') input: ArchiveCategoryInput,
  ): Promise<CategoryModel> {
    return this.categoryService.archive(user.id, input.id);
  }

  @Mutation(() => CategoryModel, { name: 'restoreCategory' })
  @UseGuards(JwtAuthGuard)
  restoreCategory(
    @CurrentUser() user: JwtUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CategoryModel> {
    return this.categoryService.restore(user.id, id);
  }

  @Mutation(() => Boolean, { name: 'deleteCategory' })
  @UseGuards(JwtAuthGuard)
  deleteCategory(
    @CurrentUser() user: JwtUser,
    @Args('input') input: DeleteCategoryInput,
  ): Promise<boolean> {
    return this.categoryService.delete(user.id, input.id);
  }
}
