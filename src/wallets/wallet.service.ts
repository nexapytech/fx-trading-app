import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Wallet, Currency } from './wallet.entity';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/transaction.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    private dataSource: DataSource,
  ) {}

  // Fund a user wallet - atomic with pessimistic lock
  async fundWallet(
    userId: string,
    currency: Currency,
    amount: number,
    idempotencyKey?: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.txRepo.findOne({ where: { idempotencyKey } });
      if (existing) return { message: 'Duplicate request', transaction: existing };
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Pessimistic write lock prevents race conditions / double funding
      let wallet = await manager
        .getRepository(Wallet)
        .createQueryBuilder('wallet')
        .setLock('pessimistic_write')
        .where('wallet.userId = :userId AND wallet.currency = :currency', { userId, currency })
        .getOne();

      if (!wallet) {
        wallet = manager.getRepository(Wallet).create({ userId, currency, balance: 0 });
        await manager.getRepository(Wallet).save(wallet);
      }

      wallet.balance = Number((Number(wallet.balance) + amount).toFixed(2));
      await manager.getRepository(Wallet).save(wallet);

      const tx = manager.getRepository(Transaction).create({
        user: { id: userId } as any,
        wallet,
        type: TransactionType.FUND,
        status: TransactionStatus.SUCCESS,
        amount,
        currency,
        rate: null,
        idempotencyKey: idempotencyKey || null,
      });
      await manager.getRepository(Transaction).save(tx);

      return {
        message: 'Wallet funded successfully',
        newBalance: wallet.balance,
        currency,
        transactionId: tx.id,
      };
    });
  }

  // Get all wallets for a user
  async getWallets(userId: string) {
    return this.walletRepo.find({ where: { userId } });
  }

  // Credit wallet - used internally by FX service, with pessimistic lock
  async creditWallet(
    userId: string,
    currency: string,
    amount: number,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Wallet)
      : this.walletRepo;

    const wallet = manager
      ? await repo
          .createQueryBuilder('wallet')
          .setLock('pessimistic_write')
          .where('wallet.userId = :userId AND wallet.currency = :currency', { userId, currency })
          .getOne()
      : await repo.findOne({ where: { userId, currency: currency as Currency } });

    if (!wallet) {
      // Auto-create wallet for new currency
      const newWallet = repo.create({ userId, currency: currency as Currency, balance: 0 });
      await repo.save(newWallet);
      newWallet.balance = Number(amount.toFixed(2));
      return repo.save(newWallet);
    }

    wallet.balance = Number((Number(wallet.balance) + amount).toFixed(2));
    return repo.save(wallet);
  }

  // Debit wallet - used internally by FX service, with pessimistic lock
  async debitWallet(
    userId: string,
    currency: string,
    amount: number,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Wallet)
      : this.walletRepo;

    const wallet = manager
      ? await repo
          .createQueryBuilder('wallet')
          .setLock('pessimistic_write')
          .where('wallet.userId = :userId AND wallet.currency = :currency', { userId, currency })
          .getOne()
      : await repo.findOne({ where: { userId, currency: currency as Currency } });

    if (!wallet) throw new NotFoundException(`No ${currency} wallet found. Please fund your wallet first.`);

    if (Number(wallet.balance) < amount)
      throw new BadRequestException(
        `Insufficient balance. Available: ${wallet.balance} ${currency}`,
      );

    wallet.balance = Number((Number(wallet.balance) - amount).toFixed(2));
    return repo.save(wallet);
  }
}
