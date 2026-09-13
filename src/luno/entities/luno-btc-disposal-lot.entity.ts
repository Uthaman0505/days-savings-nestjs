import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LunoBtcDisposal } from './luno-btc-disposal.entity';
import { LunoBtcLot } from './luno-btc-lot.entity';

@Entity('luno_btc_disposal_lots')
export class LunoBtcDisposalLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'disposal_id', type: 'uuid' })
  disposalId: string;

  @ManyToOne(() => LunoBtcDisposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'disposal_id' })
  disposal: LunoBtcDisposal;

  @Column({ name: 'lot_id', type: 'uuid' })
  lotId: string;

  @ManyToOne(() => LunoBtcLot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lot_id' })
  lot: LunoBtcLot;

  @Column({
    name: 'btc_quantity_consumed',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  btcQuantityConsumed: string;

  @Column({
    name: 'cost_basis_consumed_myr',
    type: 'numeric',
    precision: 28,
    scale: 18,
  })
  costBasisConsumedMyr: string;
}
