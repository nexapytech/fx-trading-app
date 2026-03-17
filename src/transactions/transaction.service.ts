import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus } from './transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async create(data: Partial<Transaction>) {
    const transaction = this.txRepo.create({ ...data, status: data.status ?? TransactionStatus.SUCCESS });
    return this.txRepo.save(transaction);
  }

  async getUserTransactions(userId: string, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.wallet', 'wallet')
      .where('tx.userId = :userId', { userId })
      .orderBy('tx.createdAt', 'DESC');

    if (query.type) qb.andWhere('tx.type = :type', { type: query.type });
    if (query.status) qb.andWhere('tx.status = :status', { status: query.status });

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { total, page, limit, totalPages: Math.ceil(total / limit), data };
  }

  async getAllTransactions(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [data, total] = await this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.user', 'user')
      .leftJoinAndSelect('tx.wallet', 'wallet')
      .orderBy('tx.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, totalPages: Math.ceil(total / limit), data };
  }
}
