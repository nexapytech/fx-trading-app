import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/entities/user.entity';

export type Currency = 'NGN' | 'USD' | 'EUR' | 'GBP';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string; // must match User.id type (UUID string)

  @Column({ type: 'enum', enum: ['NGN', 'USD', 'EUR', 'GBP'] })
  currency: Currency;

  @Column({
  type: 'decimal',
  precision: 18,
  scale: 2,
  default: 0,
  transformer: {
    to: (value: number) => value,
    from: (value: string) => parseFloat(value),
  },
})
balance: number;
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}