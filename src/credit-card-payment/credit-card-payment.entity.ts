import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { Transaction } from '../transaction/transaction.entity';
import { User } from '../user/user.entity';

export type CreditCardPaymentMethod =
  | 'BANK_TRANSFER'
  | 'ONLINE_BANKING'
  | 'CASH'
  | 'AUTO_DEBIT'
  | 'OTHER';

@Entity('credit_card_payments')
@Index('idx_credit_card_payments_user_id', ['userId'])
@Index('idx_credit_card_payments_credit_card_id', ['creditCardId'])
@Index('idx_credit_card_payments_payment_account_id', ['paymentAccountId'])
@Index('idx_credit_card_payments_payment_date', ['paymentDate'])
@Index('idx_credit_card_payments_user_payment_date', ['userId', 'paymentDate'])
@Index('uq_credit_card_payments_transaction_id', ['transactionId'], {
  unique: true,
})
export class CreditCardPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'credit_card_id', type: 'uuid' })
  creditCardId: string;

  @ManyToOne(() => CreditCard, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'credit_card_id' })
  creditCard: CreditCard;

  @Column({ name: 'payment_account_id', type: 'uuid' })
  paymentAccountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_account_id' })
  paymentAccount: Account;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ name: 'payment_date', type: 'timestamptz' })
  paymentDate: Date;

  @Column({ name: 'payment_method', type: 'varchar', length: 32 })
  paymentMethod: CreditCardPaymentMethod;

  @Column({
    name: 'reference_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
