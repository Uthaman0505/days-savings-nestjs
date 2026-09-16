import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { LunoBtcNewsCategory } from './luno-btc-news-event.entity';

export type LunoBtcExternalRiskLevel = 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH';
export type LunoBtcExternalRiskConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type LunoBtcNewsDataStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE';
export type LunoBtcNewsSourceHealth = 'OK' | 'DEGRADED' | 'UNAVAILABLE';

@Entity('luno_btc_news_risk_snapshots')
@Index('idx_luno_btc_news_risk_snapshots_calculated', ['calculatedAt'])
export class LunoBtcNewsRiskSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt: Date;

  @Column({ name: 'risk_level', type: 'varchar', length: 16 })
  riskLevel: LunoBtcExternalRiskLevel;

  @Column({ name: 'dominant_category', type: 'varchar', length: 32 })
  dominantCategory: LunoBtcNewsCategory;

  @Column({ type: 'varchar', length: 16 })
  confidence: LunoBtcExternalRiskConfidence;

  @Column({ name: 'relevant_event_count', type: 'int', default: 0 })
  relevantEventCount: number;

  @Column({ name: 'high_severity_event_count', type: 'int', default: 0 })
  highSeverityEventCount: number;

  @Column({ name: 'upcoming_macro_event_count', type: 'int', default: 0 })
  upcomingMacroEventCount: number;

  @Column({ name: 'independent_source_count', type: 'int', default: 0 })
  independentSourceCount: number;

  @Column({
    name: 'market_reaction_confirmed',
    type: 'boolean',
    default: false,
  })
  marketReactionConfirmed: boolean;

  @Column({ name: 'risk_score', type: 'numeric', precision: 28, scale: 18 })
  riskScore: string;

  @Column({ name: 'reason_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  reasonJson: string[];

  @Column({ name: 'source_health', type: 'varchar', length: 16 })
  sourceHealth: LunoBtcNewsSourceHealth;

  @Column({ name: 'news_data_status', type: 'varchar', length: 16 })
  newsDataStatus: LunoBtcNewsDataStatus;

  @Column({
    name: 'latest_source_event_at',
    type: 'timestamptz',
    nullable: true,
  })
  latestSourceEventAt: Date | null;

  @Column({
    name: 'last_successful_fetch_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSuccessfulFetchAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
