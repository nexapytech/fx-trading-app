import {
  Controller, Post, Body, Get, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WalletsService } from './wallet.service';
import { Currency } from './wallet.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/auth.decorators';

@ApiTags('Wallet')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all wallet balances for current user' })
  async getWallets(@CurrentUser() user: any) {
    return this.walletsService.getWallets(user.id);
  }

  @Post('fund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fund wallet in any currency' })
  async fundWallet(
    @CurrentUser() user: any,
    @Body() body: { currency: Currency; amount: number; idempotencyKey?: string },
  ) {
    return this.walletsService.fundWallet(
      user.id,
      body.currency,
      body.amount,
      body.idempotencyKey,
    );
  }
}
