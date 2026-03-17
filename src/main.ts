import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('FX Trading App API')
    .setDescription(
      `Backend API for the FX Trading App.
      
Users can register, verify email via OTP, fund multi-currency wallets, 
convert and trade currencies using real-time FX rates.

## Key Features
- Multi-currency wallet management (NGN, USD, EUR, GBP)
- Real-time FX rates with Redis caching and fallback
- Atomic wallet operations with pessimistic locking
- Idempotent transactions to prevent double-spending
- Role-based access control (User / Admin)
- Full transaction history with pagination`,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Registration, OTP verification, login')
    .addTag('Wallet', 'Fund and manage multi-currency wallets')
    .addTag('FX', 'Real-time FX rates, conversion and trading')
    .addTag('Transactions', 'Transaction history and records')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3333;
  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
