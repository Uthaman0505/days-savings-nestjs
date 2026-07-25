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
import { Account } from '../account/account.entity';
import { User } from '../user/user.entity';

export type CardNetwork =
  | 'VISA'
  | 'MASTERCARD'
  | 'AMEX'
  | 'UNIONPAY'
  | 'JCB'
  | 'OTHER';

@Entity('credit_cards')
@Index('idx_credit_cards_user_id', ['userId'])
@Index('idx_credit_cards_account_id', ['accountId'])
@Index('idx_credit_cards_is_active', ['isActive'])
@Index('uq_credit_cards_user_card_name', ['userId', 'cardName'], {
  unique: true,
})
@Index('uq_credit_cards_user_bank_last_four', ['userId', 'bankName', 'lastFourDigits'], {
  unique: true,
})
export class CreditCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null;

  @ManyToOne(() => Account, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: Account | null;

  @Column({ name: 'card_name', type: 'varchar', length: 120 })
  cardName: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 120 })
  bankName: string;

  @Column({ name: 'card_network', type: 'varchar', length: 32 })
  cardNetwork: CardNetwork;

  @Column({ name: 'last_four_digits', type: 'varchar', length: 4 })
  lastFourDigits: string;

  @Column({ name: 'credit_limit_cents', type: 'int' })
  creditLimitCents: number;

  @Column({ name: 'available_limit_cents', type: 'int' })
  availableLimitCents: number;

  @Column({ name: 'outstanding_balance_cents', type: 'int', default: 0 })
  outstandingBalanceCents: number;

  @Column({ name: 'statement_day', type: 'int' })
  statementDay: number;

  @Column({ name: 'payment_due_day', type: 'int' })
  paymentDueDay: number;

  @Column({ type: 'varchar', length: 3, default: 'MYR' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
