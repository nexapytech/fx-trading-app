# FX Trading App — CredPal Backend Engineering Assessment

> Built by **Samson Odetola**

A production-ready NestJS backend for an FX Trading App. Users can register, verify their email via OTP, fund multi-currency wallets, and trade currencies including Naira (NGN) against USD, EUR, and GBP using real-time exchange rates.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Key Design Decisions](#key-design-decisions)
- [API Endpoints](#api-endpoints)
- [Flow Diagrams](#flow-diagrams)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Assumptions](#assumptions)

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/your-username/fx-trading-app.git
cd fx-trading-app

cp .env.example .env
# Edit .env with your credentials

docker compose up -d
```

API: `http://localhost:3333`
Swagger docs: `http://localhost:3333/api/docs`

### Option 2: Local Setup

**Prerequisites:** Node.js 20+, MySQL 8, Redis 7

```bash
npm install

# Create database
mysql -u root -p -e "CREATE DATABASE fx_trading_app;"

cp .env.example .env
# Edit .env with your credentials

npm run start:dev
```

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Framework | NestJS + TypeScript | Modular, decorators, dependency injection |
| ORM | TypeORM | MySQL support, query builder, transactions |
| Database | MySQL 8 | ACID transactions for financial data |
| Cache | Redis (cache-manager) | FX rate caching with TTL |
| Auth | JWT + Passport | Stateless, scalable authentication |
| Email | Nodemailer (@nestjs-modules/mailer) | OTP delivery via Gmail SMTP |
| Docs | Swagger / OpenAPI | Auto-generated interactive API docs |
| Containers | Docker + Docker Compose | Reproducible environments |
| Testing | Jest | Unit tests for wallet and FX logic |

---

## Architecture Overview

```
src/
├── auth/                   # Registration, OTP, login, JWT
│   ├── decorators/         # @CurrentUser, @Roles
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   └── strategies/         # JWT Passport strategy
├── users/                  # User entity + service
├── wallets/                # Multi-currency wallet logic
├── fx/                     # FX rate fetching, caching, conversion, trading
├── transactions/           # Transaction history + pagination
└── mail/                   # Email OTP delivery
```

---

## Key Design Decisions

### 1. Pessimistic Locking on Wallet Operations

Every wallet debit and credit runs inside a `DataSource.transaction()` block with `SELECT ... FOR UPDATE` row-level locks.

```typescript
const wallet = await manager
  .getRepository(Wallet)
  .createQueryBuilder('wallet')
  .setLock('pessimistic_write')   // SELECT ... FOR UPDATE
  .where('wallet.userId = :userId AND wallet.currency = :currency', ...)
  .getOne();
```

**Why:** Without row-level locks, two simultaneous requests could both read the same balance, both pass the balance check, and both debit — resulting in a negative balance (double-spend). The lock ensures only one transaction modifies a wallet row at a time.

---

### 2. Idempotency Keys on All Financial Operations

Fund, convert, and trade endpoints all accept an optional `idempotencyKey`. If a request is retried with the same key, the original transaction is returned without re-executing.

```typescript
if (idempotencyKey) {
  const existing = await txRepo.findOne({ where: { idempotencyKey } });
  if (existing) return { message: 'Duplicate request', transaction: existing };
}
```

**Why:** Network timeouts and client retries are common. Without idempotency, a retry could double-charge a user. This is the same pattern used by Stripe and Paystack.

---

### 3. FX Rate Caching with Redis

FX rates are fetched from the exchange rate API and cached in Redis with a configurable TTL (default 1 hour). A hardcoded fallback rate table ensures the system degrades gracefully if the API is down.

```
Request → Redis cache hit? → Return cached rate
               ↓ miss
        Call open.er-api.com
               ↓ success → Cache in Redis → Return rate
               ↓ failure → Use fallback table → Return rate
               ↓ no fallback → Throw ServiceUnavailableException
```

---

### 4. Multi-Currency Wallet Model

Each currency is its own `Wallet` row with a unique constraint on `(userId, currency)`. This allows atomic per-currency locking and clean querying. All wallets (NGN, USD, EUR, GBP) are created automatically on registration.

```
wallets table:
| userId | currency | balance  |
|--------|----------|----------|
| user-1 | NGN      | 50000.00 |
| user-1 | USD      | 32.50    |
| user-1 | EUR      | 0.00     |
| user-1 | GBP      | 0.00     |
```

---

### 5. DECIMAL for Money Storage

All balances use `DECIMAL(18, 2)` in MySQL — never `FLOAT` or `DOUBLE` which have floating-point rounding errors.

---

### 6. OTP Security

- 6-digit numeric codes with 10-minute expiry
- Rate limiting: 5 failed attempts triggers a lockout
- OTP cleared immediately after successful verification
- Resend invalidates previous OTP and resets attempt counter

---

### 7. Role-Based Access Control

Two roles: `USER` and `ADMIN`. Admin endpoints (get all users, get all transactions) are protected with `RolesGuard` and `@Roles('ADMIN')`.

---

## API Endpoints

Full interactive Swagger docs at `http://localhost:3333/api/docs`

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Register and receive OTP |
| POST | `/auth/verify` | No | Verify OTP |
| POST | `/auth/login` | No | Login and get JWT |
| POST | `/auth/resend-otp` | No | Resend OTP |
| GET | `/auth/me` | Yes | Get current user |
| GET | `/auth/admin/users` | Admin | Get all users |

**Register**
```json
{ "username": "john_doe", "email": "john@example.com", "password": "Pass123!" }
```

**Login**
```json
{ "email": "john@example.com", "password": "Pass123!" }
```

### Wallet

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/wallets` | Yes | Get all wallet balances |
| POST | `/wallets/fund` | Yes | Fund a wallet |

**Fund wallet**
```json
{ "currency": "NGN", "amount": 50000, "idempotencyKey": "unique-uuid" }
```

### FX

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/fx/rates?base=NGN` | Yes | Get all rates for base currency |
| GET | `/fx/rate?from=NGN&to=USD` | Yes | Get specific pair rate |
| POST | `/fx/convert` | Yes | Convert between currencies |
| POST | `/fx/trade` | Yes | Trade currencies |

**Convert 1000 NGN to USD**
```json
{ "from": "NGN", "to": "USD", "amount": 1000, "idempotencyKey": "unique-uuid" }
```

**Trade 50 EUR back to NGN**
```json
{ "from": "EUR", "to": "NGN", "amount": 50, "idempotencyKey": "unique-uuid" }
```

### Transactions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/transactions?page=1&limit=10&type=FUND` | Yes | Get transaction history |
| GET | `/transactions/admin/all` | Admin | Get all transactions |

---

## Flow Diagrams

### Registration and OTP Verification

```
Client          API                 MySQL           Email
  |              |                    |               |
  |-- register ->|-- check exists --->|               |
  |              |<-- not found ------|               |
  |              |-- create user ---->|               |
  |              |-- create wallets ->|               |
  |              |-- generate OTP --->|               |
  |              |-- send OTP email ----------------->|
  |<-- 201 ------|                    |               |
  |              |                    |               |
  |-- verify  -->|-- find user+OTP -->|               |
  |              |-- check expiry     |               |
  |              |-- mark verified -->|               |
  |<-- JWT ------|                    |               |
```

---

### Currency Conversion (Atomic with Pessimistic Locking)

```
Client             API                    MySQL Transaction
  |                 |                            |
  |-- POST /fx/convert                           |
  |   { NGN->USD, 1000 }                         |
  |                 |-- idempotency check ------->|
  |                 |<-- not found ---------------|
  |                 |-- get FX rate (Redis/API)   |
  |                 |-- BEGIN TRANSACTION ------->|
  |                 |-- SELECT NGN wallet FOR UPDATE
  |                 |-- SELECT USD wallet FOR UPDATE
  |                 |-- check NGN balance >= 1000 |
  |                 |-- debit NGN wallet -------->|
  |                 |-- credit USD wallet ------->|
  |                 |-- insert transaction ------->|
  |                 |-- COMMIT ----------------- >|
  |<-- 200 result --|                            |
```

---

### Double-Spend Prevention

```
Without locks (DANGEROUS):        With pessimistic locks (SAFE):

Request A reads balance = 1000    Request A acquires FOR UPDATE lock
Request B reads balance = 1000    Request A reads balance = 1000
Both pass balance check           Request A debits: balance = 500
Both debit wallet                 Request A releases lock
Final balance = 500 (wrong!)
                                  Request B waits for lock
Result: 1000 debited twice!       Request B reads balance = 500
                                  Request B: insufficient balance ✓
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| PORT | No | Server port (default 3333) |
| NODE_ENV | No | Environment |
| DB_HOST | Yes | MySQL host |
| DB_PORT | Yes | MySQL port |
| DB_USER | Yes | MySQL username |
| DB_PASS | Yes | MySQL password |
| DB_NAME | Yes | Database name |
| JWT_SECRET | Yes | JWT signing secret |
| JWT_EXPIRES_IN | No | Token expiry (default 7d) |
| REDIS_HOST | Yes | Redis host |
| REDIS_PORT | Yes | Redis port |
| FX_CACHE_TTL | No | Rate cache TTL in seconds (default 3600) |
| MAIL_HOST | Yes | SMTP host |
| MAIL_PORT | Yes | SMTP port |
| MAIL_USER | Yes | Email address |
| MAIL_PASS | Yes | Email app password |

---

## Running Tests

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:cov
```

Tests cover wallet service (fund, debit, credit, idempotency, race conditions) and FX service (caching, fallback rates, conversion, trading).

---

## Assumptions

1. **Wallet auto-creation on registration:** All four wallets (NGN, USD, EUR, GBP) are created with zero balance when a user registers, so they are ready to receive funds immediately.

2. **Funding is trusted:** The `/wallets/fund` endpoint simulates a trusted funding event. In production this would be called by an internal payment service after a verified webhook from Paystack or Flutterwave, not directly by end users.

3. **FX rates are fetched without spread:** No fee or spread is applied on conversions. In production, a configurable fee percentage would be applied before executing the trade.

4. **CONVERT vs TRADE:** Both operations execute the same debit/credit logic. The distinction is in the transaction type field for reporting and auditability purposes.

5. **Email delivery:** OTP emails use Gmail SMTP. If delivery fails the OTP is still saved and the user can request a resend. In production a dedicated provider like SendGrid or AWS SES would be used.

6. **Rate freshness:** FX rates are cached for 1 hour by default. For higher-frequency trading this TTL can be reduced via the `FX_CACHE_TTL` environment variable.

---

*Samson Odetola — CredPal Backend Engineering Assessment*
