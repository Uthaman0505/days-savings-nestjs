import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Category')
export class CategoryModel {
  @Field(() => ID)
  id: string;

  @Field(() => String, { name: 'user_id', nullable: true })
  userId: string | null;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String)
  type: string;

  @Field(() => String, { nullable: true })
  icon: string | null;

  @Field(() => String, { nullable: true })
  color: string | null;

  @Field(() => Int, { name: 'display_order' })
  displayOrder: number;

  @Field(() => Boolean, { name: 'is_default' })
  isDefault: boolean;

  @Field(() => Boolean, { name: 'is_system' })
  isSystem: boolean;

  @Field(() => Boolean, { name: 'is_archived' })
  isArchived: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
