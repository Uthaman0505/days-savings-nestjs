import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';

@Entity('challenge_wallets')
@Index('idx_challenge_wallet_user_plan_id', ['userSavingPlanId'], {
  unique: true,
})
export class ChallengeWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_saving_plan_id', type: 'uuid', unique: true })
  userSavingPlanId: string;

  @ManyToOne(() => UserSavingPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_saving_plan_id' })
  userSavingPlan: UserSavingPlan;

  @Column({ name: 'balance_cents', type: 'int', default: 0 })
  balanceCents: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
