import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_user_trades')
@Index('uq_luno_user_trades_pair_seq', ['pair', 'sequence'], { unique: true })
export class LunoUserTradeRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  pair: string;

  @Column({ type: 'bigint' })
  sequence: string;

  @Column({
    name: 'luno_order_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  lunoOrderId: string | null;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  @Column({ name: 'is_buy', type: 'boolean' })
  isBuy: boolean;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  base: string;

  @Column({ type: 'numeric', precision: 28, scale: 18 })
  counter: string;

  @Column({ name: 'fee_base', type: 'numeric', precision: 28, scale: 18 })
  feeBase: string;

  @Column({ name: 'fee_counter', type: 'numeric', precision: 28, scale: 18 })
  feeCounter: string;

  @Column({ type: 'numeric', precision: 28, scale: 18, nullable: true })
  price: string | null;

  @Column({ name: 'traded_at', type: 'timestamptz' })
  tradedAt: Date;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
