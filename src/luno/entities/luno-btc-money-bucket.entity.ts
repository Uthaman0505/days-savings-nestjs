import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';

export type LunoBtcMoneyBucketType =
  | 'PROTECTED_PROFIT'
  | 'REINVESTMENT_RESERVE';

@Entity('luno_btc_money_buckets')
@Index('idx_luno_btc_money_buckets_user_type', ['userId', 'bucketType'])
export class LunoBtcMoneyBucket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'bucket_type', type: 'varchar', length: 32 })
  bucketType: LunoBtcMoneyBucketType;

  @Column({
    name: 'amount_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  amountMyr: string;

  @Column({
    name: 'source_reference',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  sourceReference: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
