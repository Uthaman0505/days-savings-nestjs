import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';

@Entity('luno_btc_harvest_settings')
@Unique('uq_luno_btc_harvest_settings_user', ['userId'])
export class LunoBtcHarvestSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'first_harvest_profit_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  firstHarvestProfitPct: string;

  @Column({
    name: 'second_harvest_profit_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  secondHarvestProfitPct: string;

  @Column({
    name: 'high_harvest_profit_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  highHarvestProfitPct: string;

  @Column({
    name: 'first_harvest_profit_fraction',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  firstHarvestProfitFraction: string;

  @Column({
    name: 'second_harvest_profit_fraction',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  secondHarvestProfitFraction: string;

  @Column({
    name: 'high_harvest_profit_fraction',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  highHarvestProfitFraction: string;

  @Column({
    name: 'protected_profit_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  protectedProfitPct: string;

  @Column({
    name: 'reinvestment_reserve_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  reinvestmentReservePct: string;

  @Column({
    name: 'minimum_core_pct',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  minimumCorePct: string;

  @Column({
    name: 'minimum_harvest_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  minimumHarvestMyr: string;

  @Column({
    name: 'estimated_sell_fee_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
    default: 0,
  })
  estimatedSellFeeMyr: string;

  @Column({
    name: 'minimum_btc_sale',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  minimumBtcSale: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
