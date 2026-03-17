import { IsOptional, IsEnum, IsNumberString } from 'class-validator';
import { TransactionType } from '../transaction.entity';

export class QueryTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}