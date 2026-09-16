import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type LunoBtcNewsProviderName = 'FINNHUB' | 'NONE';
export type LunoBtcNewsCategory =
  | 'MACRO'
  | 'CRYPTO'
  | 'REGULATION'
  | 'BANKING'
  | 'GEOPOLITICAL'
  | 'INSTITUTIONAL'
  | 'NONE';
export type LunoBtcNewsSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type LunoBtcNewsSentiment = 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE';

@Entity('luno_btc_news_events')
@Unique('uq_luno_btc_news_events', ['provider', 'externalId'])
@Index('idx_luno_btc_news_events_published', ['publishedAt'])
@Index('idx_luno_btc_news_events_provider', ['provider'])
@Index('idx_luno_btc_news_events_category', ['category'])
@Index('idx_luno_btc_news_events_severity', ['severity'])
export class LunoBtcNewsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'varchar', length: 128 })
  externalId: string;

  @Column({ type: 'varchar', length: 32 })
  provider: LunoBtcNewsProviderName;

  @Column({ name: 'source_name', type: 'varchar', length: 128 })
  sourceName: string;

  @Column({ name: 'source_url', type: 'varchar', length: 1024, nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'varchar', length: 512 })
  headline: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'normalized_headline', type: 'varchar', length: 512 })
  normalizedHeadline: string;

  @Column({ type: 'varchar', length: 32 })
  category: LunoBtcNewsCategory;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;

  @Column({
    name: 'relevance_score',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  relevanceScore: string;

  @Column({ type: 'varchar', length: 16 })
  severity: LunoBtcNewsSeverity;

  @Column({ name: 'sentiment_direction', type: 'varchar', length: 16 })
  sentimentDirection: LunoBtcNewsSentiment;

  @Column({ name: 'btc_specific', type: 'boolean', default: false })
  btcSpecific: boolean;

  @Column({ name: 'macro_specific', type: 'boolean', default: false })
  macroSpecific: boolean;

  @Column({
    name: 'country_or_region',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  countryOrRegion: string | null;

  @Column({
    name: 'raw_metadata_json',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  rawMetadataJson: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
