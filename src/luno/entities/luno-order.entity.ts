import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('luno_orders')
@Index('uq_luno_orders_order_id', ['lunoOrderId'], { unique: true })
@Index('idx_luno_orders_pair_created', ['pair', 'createdAtLuno'])
export class LunoOrderRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'luno_order_id', type: 'varchar', length: 64 })
  lunoOrderId: string;

  @Column({ type: 'varchar', length: 16 })
  pair: string;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  @Column({ type: 'varchar', length: 16 })
  state: string;

  @Column({ name: 'base_amount', type: 'numeric', precision: 28, scale: 18 })
  baseAmount: string;

  @Column({ name: 'counter_amount', type: 'numeric', precision: 28, scale: 18 })
  counterAmount: string;

  @Column({ name: 'fee_base', type: 'numeric', precision: 28, scale: 18 })
  feeBase: string;

  @Column({ name: 'fee_counter', type: 'numeric', precision: 28, scale: 18 })
  feeCounter: string;

  @Column({
    name: 'limit_price',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  limitPrice: string | null;

  @Column({ name: 'created_at_luno', type: 'timestamptz' })
  createdAtLuno: Date;

  @Column({ name: 'completed_at_luno', type: 'timestamptz', nullable: true })
  completedAtLuno: Date | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
