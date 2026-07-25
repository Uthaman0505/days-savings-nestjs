import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export type CategoryType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'LOAN'
  | 'INSURANCE'
  | 'SAVING'
  | 'INVESTMENT'
  | 'GOAL'
  | 'OTHER';

@Entity('categories')
@Index('idx_categories_user_id', ['userId'])
@Index('idx_categories_type', ['type'])
@Index('uq_categories_system_type_name', ['type', 'name'], {
  unique: true,
  where: '"user_id" IS NULL AND "is_system" = true',
})
@Index('uq_categories_user_type_name', ['userId', 'type', 'name'], {
  unique: true,
  where: '"user_id" IS NOT NULL',
})
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null for system categories shared by all users. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 32 })
  type: CategoryType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  color: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
