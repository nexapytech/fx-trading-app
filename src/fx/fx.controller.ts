// src/fx/fx.controller.ts
import {
  Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FxService } from './fx.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/auth.decorators';

@ApiTags('FX')
@Controller('fx')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Get FX rates for a base currency (Redis cached)' })
  @ApiQuery({ name: 'base', required: false })
  getRates(@Query('base') base: string) {
    return this.fxService.getRates(base || 'NGN');
  }

  @Get('rate')
  @ApiOperation({ summary: 'Get rate for a specific currency pair' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async getRate(@Query('from') from: string, @Query('to') to: string) {
    const rate = await this.fxService.getRate(from, to);
    return { from, to, rate, timestamp: new Date().toISOString() };
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert between currencies using real-time FX rates' })
  async convert(
    @CurrentUser() user: any,
    @Body() body: { from: string; to: string; amount: number; idempotencyKey?: string },
  ) {
    return this.fxService.convert(user.id, body.from, body.to, body.amount, body.idempotencyKey);
  }

  @Post('trade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trade Naira against other currencies and vice versa' })
  async trade(
    @CurrentUser() user: any,
    @Body() body: { from: string; to: string; amount: number; idempotencyKey?: string },
  ) {
    return this.fxService.trade(user.id, body.from, body.to, body.amount, body.idempotencyKey);
  }
}
