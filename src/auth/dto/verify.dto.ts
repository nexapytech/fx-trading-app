// src/auth/dto/verify.dto.ts
import { IsEmail, IsNotEmpty, IsNumberString, Length } from 'class-validator';

export class VerifyDto {
  @IsEmail()
  email: string;

  @IsNumberString()
  @Length(6, 6)
  otp: string;
}