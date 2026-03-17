// src/fx/fx.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { WalletsModule } from '../wallets/wallet.module';
import { TransactionModule } from '../transactions/transaction.module';

@Module({
  imports: [HttpModule, WalletsModule, TransactionModule],
  providers: [FxService],
  controllers: [FxController],
  exports: [FxService],
})
export class FxModule {}
