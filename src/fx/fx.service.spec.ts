import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { FxService } from './fx.service';
import { WalletsService } from '../wallets/wallet.service';
import { TransactionService } from '../transactions/transaction.service';
import { of, throwError } from 'rxjs';

const mockHttpService = { get: jest.fn() };
const mockCacheManager = { get: jest.fn(), set: jest.fn() };
const mockConfigService = {
  get: jest.fn().mockImplementation((key, fallback) => {
    const config = { FX_CACHE_TTL: 3600 };
    return config[key] ?? fallback;
  }),
};
const mockWalletService = { debitWallet: jest.fn(), creditWallet: jest.fn() };
const mockTxService = { create: jest.fn() };
const mockDataSource = {
  transaction: jest.fn(),
  getRepository: jest.fn(),
};

describe('FxService', () => {
  let service: FxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: WalletsService, useValue: mockWalletService },
        { provide: TransactionService, useValue: mockTxService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<FxService>(FxService);
    jest.clearAllMocks();
  });

  describe('getRate', () => {
    it('should return 1 for same currency', async () => {
      const rate = await service.getRate('NGN', 'NGN');
      expect(rate).toBe(1);
      expect(mockCacheManager.get).not.toHaveBeenCalled();
    });

    it('should return cached rate if available', async () => {
      mockCacheManager.get.mockResolvedValue(0.00065);
      const rate = await service.getRate('NGN', 'USD');
      expect(rate).toBe(0.00065);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('should fetch from API, cache and return rate on cache miss', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(of({ data: { rates: { USD: 0.00065 } } }));
      mockCacheManager.set.mockResolvedValue(undefined);

      const rate = await service.getRate('NGN', 'USD');
      expect(rate).toBe(0.00065);
      expect(mockCacheManager.set).toHaveBeenCalledWith('fx_rate_NGN_USD', 0.00065, 3600000);
    });

    it('should return fallback rate when API fails', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(throwError(() => new Error('API down')));

      const rate = await service.getRate('NGN', 'USD');
      expect(rate).toBe(0.00065);
    });

    it('should throw ServiceUnavailableException when API fails and no fallback', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(throwError(() => new Error('API down')));

      await expect(service.getRate('NGN', 'JPY')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('convert', () => {
    it('should throw BadRequestException when converting same currency', async () => {
      await expect(service.convert('user-1', 'NGN', 'NGN', 100)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for amount <= 0', async () => {
      await expect(service.convert('user-1', 'NGN', 'USD', 0)).rejects.toThrow(BadRequestException);
    });

    it('should return duplicate for repeated idempotency key', async () => {
      const existingTx = { id: 'tx-1' };
      mockDataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(existingTx) });

      const result = await service.convert('user-1', 'NGN', 'USD', 1000, 'idem-key');
      expect(result).toHaveProperty('message', 'Duplicate request');
    });

    it('should execute conversion successfully', async () => {
      mockDataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      mockCacheManager.get.mockResolvedValue(0.00065);

      const mockTx = { id: 'tx-1' };
      mockDataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn().mockReturnValue(mockTx),
            save: jest.fn().mockResolvedValue(mockTx),
          }),
        };
        mockWalletService.debitWallet.mockResolvedValue({});
        mockWalletService.creditWallet.mockResolvedValue({});
        return cb(manager);
      });

      const result = await service.convert('user-1', 'NGN', 'USD', 1000);
      expect(result).toHaveProperty('message', 'Conversion successful');
      expect(result).toHaveProperty('rate', 0.00065);
    });
  });

  describe('trade', () => {
    it('should throw BadRequestException when trading same currency', async () => {
      await expect(service.trade('user-1', 'USD', 'USD', 50)).rejects.toThrow(BadRequestException);
    });

    it('should execute trade successfully', async () => {
      mockDataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      mockCacheManager.get.mockResolvedValue(1540);

      const mockTx = { id: 'tx-1' };
      mockDataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn().mockReturnValue(mockTx),
            save: jest.fn().mockResolvedValue(mockTx),
          }),
        };
        mockWalletService.debitWallet.mockResolvedValue({});
        mockWalletService.creditWallet.mockResolvedValue({});
        return cb(manager);
      });

      const result = await service.trade('user-1', 'USD', 'NGN', 50);
      expect(result).toHaveProperty('message', 'Trade executed successfully');
      expect(result).toHaveProperty('soldCurrency', 'USD');
      expect(result).toHaveProperty('boughtCurrency', 'NGN');
    });
  });
});
