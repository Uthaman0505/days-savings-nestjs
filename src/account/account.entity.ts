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

/** Liquid / card containers where personal money is stored. */
export type AccountType =
  | 'CASH'
  | 'BANK'
  | 'SAVINGS'
  | 'CURRENT'
  | 'CREDIT_CARD'
  | 'WISE'
  | 'TOUCH_N_GO'
  | 'WALLET'
  | 'OTHER';

@Entity('accounts')
@Index('idx_accounts_user_id', ['userId'])
@Index('uq_accounts_user_account_name', ['userId', 'accountName'], {
  unique: true,
})
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_name', type: 'varchar', length: 120 })
  accountName: string;

  @Column({ name: 'account_type', type: 'varchar', length: 32 })
  accountType: AccountType;

  @Column({ name: 'bank_name', type: 'varchar', length: 120, nullable: true })
  bankName: string | null;

  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  accountNumber: string | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 3, default: 'MYR' })
  currencyCode: string;

  @Column({ name: 'opening_balance_cents', type: 'int', default: 0 })
  openingBalanceCents: number;

  @Column({ name: 'current_balance_cents', type: 'int', default: 0 })
  currentBalanceCents: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
