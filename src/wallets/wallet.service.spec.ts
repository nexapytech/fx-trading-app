import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletsService } from './wallet.service';
import { Wallet } from './wallet.entity';
import { Transaction } from '../transactions/transaction.entity';

const mockWalletRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockTxRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockManager = { getRepository: jest.fn() };
const mockDataSource = { transaction: jest.fn() };

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: mockWalletRepo },
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
    jest.clearAllMocks();
  });

  describe('fundWallet', () => {
    it('should throw BadRequestException for amount <= 0', async () => {
      await expect(service.fundWallet('user-1', 'NGN', 0)).rejects.toThrow(BadRequestException);
      await expect(service.fundWallet('user-1', 'NGN', -100)).rejects.toThrow(BadRequestException);
    });

    it('should return duplicate response for repeated idempotency key', async () => {
      const existingTx = { id: 'tx-1', type: 'FUND' };
      mockTxRepo.findOne.mockResolvedValue(existingTx);

      const result = await service.fundWallet('user-1', 'NGN', 5000, 'idem-key-123');

      expect(result).toHaveProperty('message', 'Duplicate request');
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should fund wallet successfully using atomic transaction', async () => {
      mockTxRepo.findOne.mockResolvedValue(null);

      const mockWallet = { id: 'w-1', balance: 10000, currency: 'NGN' };
      const mockTx = { id: 'tx-1' };

      mockDataSource.transaction.mockImplementation(async (cb) => {
        const walletRepo = {
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(mockWallet),
          }),
          save: jest.fn().mockResolvedValue(mockWallet),
          create: jest.fn(),
        };
        const txRepo = {
          create: jest.fn().mockReturnValue(mockTx),
          save: jest.fn().mockResolvedValue(mockTx),
        };
        mockManager.getRepository.mockImplementation((entity) =>
          entity === Wallet ? walletRepo : txRepo,
        );
        return cb(mockManager);
      });

      const result = await service.fundWallet('user-1', 'NGN', 5000);
      expect(result).toHaveProperty('message', 'Wallet funded successfully');
      expect(result).toHaveProperty('currency', 'NGN');
    });
  });

  describe('getWallets', () => {
    it('should return all wallets for a user', async () => {
      const wallets = [
        { id: 'w-1', currency: 'NGN', balance: 5000 },
        { id: 'w-2', currency: 'USD', balance: 3.25 },
      ];
      mockWalletRepo.find.mockResolvedValue(wallets);

      const result = await service.getWallets('user-1');
      expect(result).toEqual(wallets);
      expect(mockWalletRepo.find).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });
  });

  describe('debitWallet', () => {
    it('should throw NotFoundException when wallet does not exist', async () => {
      mockWalletRepo.findOne.mockResolvedValue(null);
      await expect(service.debitWallet('user-1', 'USD', 100)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on insufficient balance', async () => {
      mockWalletRepo.findOne.mockResolvedValue({ id: 'w-1', balance: 50, currency: 'USD' });
      await expect(service.debitWallet('user-1', 'USD', 100)).rejects.toThrow(BadRequestException);
    });

    it('should debit wallet successfully', async () => {
      const wallet = { id: 'w-1', balance: 500, currency: 'USD' };
      mockWalletRepo.findOne.mockResolvedValue(wallet);
      mockWalletRepo.save.mockResolvedValue({ ...wallet, balance: 400 });

      const result = await service.debitWallet('user-1', 'USD', 100);
      expect(result.balance).toBe(400);
    });
  });

  describe('creditWallet', () => {
    it('should credit existing wallet', async () => {
      const wallet = { id: 'w-1', balance: 100, currency: 'USD' };
      mockWalletRepo.findOne.mockResolvedValue(wallet);
      mockWalletRepo.save.mockResolvedValue({ ...wallet, balance: 150 });

      const result = await service.creditWallet('user-1', 'USD', 50);
      expect(result.balance).toBe(150);
    });

    it('should auto-create wallet and credit for new currency', async () => {
      mockWalletRepo.findOne.mockResolvedValue(null);
      const newWallet = { id: 'w-new', balance: 0, currency: 'EUR' };
      mockWalletRepo.create.mockReturnValue(newWallet);
      mockWalletRepo.save.mockResolvedValue({ ...newWallet, balance: 50 });

      const result = await service.creditWallet('user-1', 'EUR', 50);
      expect(mockWalletRepo.create).toHaveBeenCalled();
    });
  });
});
