import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Currency } from '../wallets/wallet.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
  ) {}

  async create(userData: Partial<User>) {
    const user = this.userRepo.create(userData);
    await this.userRepo.save(user);

    const currencies: Currency[] = ['NGN', 'USD', 'EUR', 'GBP'];

    for (const currency of currencies) {
      const wallet = this.walletRepo.create({
        user,
        userId: user.id,
        currency,
        balance: 0,
      });
      await this.walletRepo.save(wallet);
    }

    return user;
  }

  async findById(id: string) {
    return this.userRepo.findOne({
      where: { id },
      relations: ['wallets'],
    });
  }

  async findAll() {
    return this.userRepo.find({
      select: ['id', 'username', 'email', 'role', 'isVerified', 'createdAt'],
    });
  }

  async findByEmail(email: string) {
    return this.userRepo.findOne({ where: { email } });
  }
}