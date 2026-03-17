// src/auth/auth.service.ts
import { Injectable, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private mailService: MailService,
    private jwtService: JwtService,
  ) {}

  async register(data: { username: string; email: string; password: string }) {
    const existing = await this.userRepo.findOne({
      where: [{ email: data.email }, { username: data.username }],
    });
    if (existing)
      throw new BadRequestException('User with email or username already exists');

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const otp = this.generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const user = this.userRepo.create({
      username: data.username,
      email: data.email,
      password: hashedPassword,
      otp,
      otpExpiresAt,
      otpAttempts: 0,
      isVerified: false,
    });
    await this.userRepo.save(user);
    await this.mailService.sendOtp(user.email, otp);

    return { message: 'Registration successful. OTP sent to email.', userId: user.id };
  }

  async login(data: { email: string; password: string }) {
    const user = await this.userRepo.findOne({ where: { email: data.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    if (!user.isVerified) {
      await this.resendOtp(user.email);
      throw new UnauthorizedException('Email not verified. A new OTP has been sent.');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });

    return {
      message: 'Login successful',
      accessToken: token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isVerified) return { message: 'User already verified' };

    if (user.otpAttempts >= 5)
      throw new ForbiddenException('Too many attempts. Please request a new OTP.');

    if (user.otp !== otp) {
      user.otpAttempts += 1;
      await this.userRepo.save(user);
      throw new BadRequestException('Invalid OTP');
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date())
      throw new BadRequestException('OTP expired. Please request a new one.');

    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    return { message: 'Email verified successfully', accessToken: token };
  }

  async resendOtp(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isVerified) return { message: 'User already verified' };

    const otp = this.generateOtp();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    await this.userRepo.save(user);
    await this.mailService.sendOtp(user.email, otp);
    return { message: 'New OTP sent to email' };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
