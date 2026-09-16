import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { LunoBtcNewsProviderName } from './luno-btc-news-event.entity';

export type LunoBtcEconomicCategory =
  | 'INTEREST_RATE'
  | 'CPI'
  | 'PCE'
  | 'EMPLOYMENT'
  | 'GDP'
  | 'CENTRAL_BANK'
  | 'BANKING'
  | 'OTHER';
export type LunoBtcEconomicImportance = 'LOW' | 'MEDIUM' | 'HIGH';
export type LunoBtcEconomicStatus = 'SCHEDULED' | 'RELEASED' | 'UNKNOWN';

@Entity('luno_btc_economic_events')
@Unique('uq_luno_btc_economic_events', ['provider', 'externalId'])
@Index('idx_luno_btc_economic_events_scheduled', ['scheduledAt'])
@Index('idx_luno_btc_economic_events_provider', ['provider'])
@Index('idx_luno_btc_economic_events_category', ['category'])
export class LunoBtcEconomicEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'varchar', length: 128 })
  externalId: string;

  @Column({ type: 'varchar', length: 32 })
  provider: LunoBtcNewsProviderName;

  @Column({ name: 'event_name', type: 'varchar', length: 256 })
  eventName: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 32 })
  category: LunoBtcEconomicCategory;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'actual_value', type: 'varchar', length: 64, nullable: true })
  actualValue: string | null;

  @Column({
    name: 'forecast_value',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  forecastValue: string | null;

  @Column({
    name: 'previous_value',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  previousValue: string | null;

  @Column({ type: 'varchar', length: 16 })
  importance: LunoBtcEconomicImportance;

  @Column({ type: 'varchar', length: 16 })
  status: LunoBtcEconomicStatus;

  @Column({ name: 'source_url', type: 'varchar', length: 1024, nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
