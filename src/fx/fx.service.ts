import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  Inject,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager'; // ✅ FIXED
import { CACHE_MANAGER } from '@nestjs/cache-manager';

import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';

import { WalletsService } from '../wallets/wallet.service';
import { TransactionService } from '../transactions/transaction.service';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { User } from '../users/entities/user.entity';

/**
 * Fallback FX rates (used if API unavailable)
 */
const FALLBACK_RATES: Record<string, number> = {
  NGN_USD: 0.00065,
  NGN_EUR: 0.0006,
  NGN_GBP: 0.00051,
  USD_NGN: 1540,
  EUR_NGN: 1670,
  GBP_NGN: 1960,
  USD_EUR: 0.92,
  USD_GBP: 0.79,
  EUR_USD: 1.09,
  EUR_GBP: 0.86,
  GBP_USD: 1.27,
  GBP_EUR: 1.17,
};

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);

  constructor(
    private readonly http: HttpService,
    private readonly walletService: WalletsService,
    private readonly transactionService: TransactionService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache, // ✅ works now
  ) {}

  /**
   * Get FX rate (cached + fallback)
   */
  async getRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;

    const cacheKey = `fx_rate_${from}_${to}`;

    const cached = await this.cacheManager.get<number>(cacheKey);
    if (cached !== undefined && cached !== null) {
      this.logger.debug(`Cache hit ${from}->${to}: ${cached}`);
      return cached;
    }

    try {
      const response = await firstValueFrom(
        this.http.get(`https://open.er-api.com/v6/latest/${from}`),
      );

      const rate = response.data?.rates?.[to];
      if (!rate) throw new Error(`Missing rate ${to}`);

      const ttl = this.configService.get<number>('FX_CACHE_TTL', 3600);

      await this.cacheManager.set(cacheKey, rate, ttl);

      this.logger.log(`Fetched FX ${from}->${to}: ${rate}`);

      return rate;
    } catch (err: any) {
      this.logger.warn(`FX API failed: ${err.message}`);

      const fallback = FALLBACK_RATES[`${from}_${to}`];
      if (fallback) {
        this.logger.warn(`Using fallback rate ${from}->${to}`);
        return fallback;
      }

      throw new ServiceUnavailableException(
        'FX rate service unavailable',
      );
    }
  }

  /**
   * Get multiple rates
   */
  async getRates(base = 'NGN') {
    const cacheKey = `fx_all_${base}`;

    const cached =
      await this.cacheManager.get<Record<string, number>>(cacheKey);

    if (cached) {
      return { base, rates: cached, cached: true };
    }

    try {
      const response = await firstValueFrom(
        this.http.get(`https://open.er-api.com/v6/latest/${base}`),
      );

      const rates = {
        NGN: response.data.rates.NGN || 1,
        USD: response.data.rates.USD,
        EUR: response.data.rates.EUR,
        GBP: response.data.rates.GBP,
      };

      const ttl = this.configService.get<number>('FX_CACHE_TTL', 3600);
      await this.cacheManager.set(cacheKey, rates, ttl);

      return { base, rates, cached: false };
    } catch (err: any) {
      this.logger.warn(`Rate fetch failed: ${err.message}`);

      const rates: Record<string, number> = {};

      Object.keys(FALLBACK_RATES)
        .filter((k) => k.startsWith(base))
        .forEach((k) => {
          rates[k.split('_')[1]] = FALLBACK_RATES[k];
        });

      return { base, rates, fallback: true };
    }
  }

  /**
   * Currency conversion (atomic transaction)
   */
  async convert(
    userId: string,
    from: string,
    to: string,
    amount: number,
    idempotencyKey?: string,
  ) {
    if (from === to)
      throw new BadRequestException('Currencies must differ');

    if (amount <= 0)
      throw new BadRequestException('Amount must be positive');

    // idempotency protection
    if (idempotencyKey) {
      const existing = await this.dataSource
        .getRepository(Transaction)
        .findOne({ where: { idempotencyKey } });

      if (existing) {
        return { message: 'Duplicate request', transaction: existing };
      }
    }

    const rate = await this.getRate(from, to);
    const convertedAmount = Number((amount * rate).toFixed(2));

    return this.dataSource.transaction(async (manager) => {
      await this.walletService.debitWallet(userId, from, amount, manager);
      await this.walletService.creditWallet(
        userId,
        to,
        convertedAmount,
        manager,
      );

      const txRepo = manager.getRepository(Transaction);

      const tx = txRepo.create({
        user: { id: userId } as User,
        type: TransactionType.CONVERT,
        status: TransactionStatus.SUCCESS,
        amount,
        currency: from,
        rate,
        idempotencyKey: idempotencyKey ?? null,
      });

      await txRepo.save(tx);

      return {
        message: 'Conversion successful',
        amountSent: amount,
        amountReceived: convertedAmount,
        rate,
        transactionId: tx.id,
      };
    });
  }

  /**
   * Trade currency
   */
  async trade(
    userId: string,
    from: string,
    to: string,
    amount: number,
    idempotencyKey?: string,
  ) {
    if (from === to)
      throw new BadRequestException('Currencies must differ');

    if (amount <= 0)
      throw new BadRequestException('Amount must be positive');

    const rate = await this.getRate(from, to);
    const receivedAmount = Number((amount * rate).toFixed(2));

    return this.dataSource.transaction(async (manager) => {
      await this.walletService.debitWallet(userId, from, amount, manager);
      await this.walletService.creditWallet(
        userId,
        to,
        receivedAmount,
        manager,
      );

      const tx = manager.getRepository(Transaction).create({
        user: { id: userId } as User,
        type: TransactionType.TRADE,
        status: TransactionStatus.SUCCESS,
        amount,
        currency: from,
        rate,
        idempotencyKey: idempotencyKey ?? null,
      });

      await manager.getRepository(Transaction).save(tx);

      return {
        message: 'Trade executed successfully',
        sold: amount,
        bought: receivedAmount,
        rate,
        transactionId: tx.id,
      };
    });
  }
}