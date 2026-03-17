import {
  Controller, Get, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser, Roles } from '../auth/decorators/auth.decorators';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { TransactionType } from './transaction.entity';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionController {
  constructor(private readonly txService: TransactionService) {}

  @Get()
  @ApiOperation({ summary: 'Get transaction history for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: TransactionType })
  async getTransactions(
    @CurrentUser() user: any,
    @Query() query: QueryTransactionDto,
  ) {
    return this.txService.getUserTransactions(user.id, query);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin: Get all transactions' })
  async getAllTransactions(@Query() query: QueryTransactionDto) {
    return this.txService.getAllTransactions(query);
  }
}
