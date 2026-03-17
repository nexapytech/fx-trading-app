import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/wallet.entity';

export enum TransactionType {
  FUND = 'FUND',
  CONVERT = 'CONVERT',
  TRADE = 'TRADE',
}

export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => Wallet, { eager: true, nullable: true })
  wallet: Wallet;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column('decimal', { precision: 18, scale: 6 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column('decimal', {
    precision: 18,
    scale: 6,
    nullable: true,
  })
  rate?: number | null;

  @Column({
    type: 'varchar',   // ✅ Explicit type for MySQL
    length: 255,
    unique: true,      // ✅ Unique idempotency key
    nullable: true,    // ✅ Optional
  })
  idempotencyKey?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ 
    type: 'enum', 
    enum: TransactionStatus, 
    default: TransactionStatus.SUCCESS 
  })
  status: TransactionStatus;
}