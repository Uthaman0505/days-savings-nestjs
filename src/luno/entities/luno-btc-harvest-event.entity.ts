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
import { User } from '../../user/user.entity';
import type {
  LunoBtcHarvestAction,
  LunoBtcHarvestZone,
} from '../accounting/luno-btc-harvest';

export type LunoBtcHarvestEventStatus =
  | 'OPEN'
  | 'ACTED'
  | 'EXPIRED'
  | 'SUPERSEDED';

@Entity('luno_btc_harvest_events')
@Index('idx_luno_btc_harvest_events_user_status', ['userId', 'status'])
@Index('idx_luno_btc_harvest_events_user_triggered', ['userId', 'triggeredAt'])
export class LunoBtcHarvestEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  zone: LunoBtcHarvestZone;

  @Column({ type: 'varchar', length: 32 })
  action: LunoBtcHarvestAction;

  @Column({
    name: 'trigger_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  triggerPriceMyr: string | null;

  @Column({
    name: 'open_average_price_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  openAveragePriceMyr: string | null;

  @Column({
    name: 'profit_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  profitPct: string | null;

  @Column({
    name: 'suggested_harvest_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  suggestedHarvestMyr: string | null;

  @Column({
    name: 'suggested_btc_to_sell',
    type: 'numeric',
    precision: 28,
    scale: 18,
    nullable: true,
  })
  suggestedBtcToSell: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: LunoBtcHarvestEventStatus;

  @Column({ name: 'reason_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  reasonJson: string[];

  @Column({ name: 'triggered_at', type: 'timestamptz' })
  triggeredAt: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'acted_at', type: 'timestamptz', nullable: true })
  actedAt: Date | null;

  @Column({
    name: 'matched_transaction_ref',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  matchedTransactionRef: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
