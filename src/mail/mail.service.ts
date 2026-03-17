import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendOtp(email: string, otp: string) {
    console.log(`Sending OTP ${otp} to ${email}`); // log for testing
    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify your FX account',
      text: `Your OTP is ${otp}`,
    });
  }
}
