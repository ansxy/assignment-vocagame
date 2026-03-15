# Vocagame Wallet API

A production-ready wallet/fintech REST API built with **Node.js**, **TypeScript**, **PostgreSQL**, **Sequelize**, and **Redis**.

---

## Features

- Multi-currency wallet management (IDR, USD, SGD, EUR)
- Atomic fund transfers with PostgreSQL row-level locking
- Append-only ledger with PostgreSQL trigger + Sequelize hooks
- Redis idempotency guard to prevent duplicate requests
- Joi request validation on all mutating endpoints
- Clean layered architecture (controller → service → repository)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 + TypeScript |
| Framework | Express |
| ORM | Sequelize v6 |
| Database | PostgreSQL 17 |
| Cache / Idempotency | Redis 7 |
| Validation | Joi |
| Testing | Jest + ts-jest |
| API Docs | Bruno |

---

## Project Structure

```txt
src/
  app.ts                        # Express app factory
  server.ts                     # Entry point — bootstraps DB, Redis, HTTP server
  config/
    env.ts                      # Environment variable config
  controllers/
    base.controller.ts          # BaseController with Joi validation hook
    user.controller.ts
    wallet.controller.ts
  database/
    sql.ts                      # Sequelize singleton + model registration + associations
    redis.ts                    # Redis client singleton
  middleware/
    validation.ts               # Joi validateRequest middleware
  repositories/
    base.repository.ts
    user.repository.ts
    wallets.repository.ts
    wallet-ledger.repository.ts
  routes/
    health.routes.ts
    user.routes.ts
    wallet.routes.ts
  services/
    user.service.ts
    wallet.service.ts
  shared/
    constant/common.ts
    errors/http-error.ts
    idempotency/redis-idempotency.ts
    middleware/error-handler.ts
  types/
  validation/
    wallet.schema.ts
database/
  config/config.js
  migrations/
  models/
    user.model.ts
    wallet.model.ts
    wallet-ledger.model.ts
  seeders/
api-docs/                       # Bruno collection
```

---

## Prerequisites

- **Node.js** >= 18
- **Docker** (for PostgreSQL and Redis) **or** local PostgreSQL 14+ and Redis 7+

---

## Getting Started

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd assignment-vocagame
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root (all values below are the defaults):

```env
PORT=3000

# PostgreSQL
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 3. Start PostgreSQL and Redis via Docker

```bash
docker compose up -d
```

This starts:
- `postgresql` on port `5432`
- `redis` on port `6379`

### 4. Run database migrations

```bash
npx sequelize db:migrate --migrations-path database/migrations --config database/config/config.js
```

### 5. Seed the database

```bash
npx sequelize db:seed:all --seeders-path database/seeders --config database/config/config.js
```

This inserts 5 users, each with 4 currency wallets (IDR, USD, SGD, EUR). The first user's IDR wallet is seeded with a balance of **1,000,000,000.00**.

### 6. Start the development server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start server in watch mode (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output from `dist/` |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

---

## API Endpoints

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |

### Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user by ID (includes wallets) |

### Wallets

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/wallets/users/:userId/wallets` | Create a wallet for a user |
| `GET` | `/api/wallets/:walletId` | Get wallet by ID |
| `POST` | `/api/wallets/users/:userId/topup` | Top up wallet balance |
| `POST` | `/api/wallets/users/:userId/pay` | Deduct funds from wallet |
| `POST` | `/api/wallets/transfer` | Transfer funds between wallets |
| `POST` | `/api/wallets/transfer/by-user` | Transfer using sender user, recipient user, and currency |
| `PATCH` | `/api/wallets/:walletId/status` | Update wallet status (`active` / `suspended`) |

#### Idempotency

The `topup`, `pay`, and `transfer` endpoints require an **`Idempotency-Key`** request header to prevent duplicate operations:

```
Idempotency-Key: <unique-string-per-request>
```

---

## API Docs (Bruno)

The `api-docs/` folder contains a [Bruno](https://www.usebruno.com/) collection with pre-built requests for every endpoint.

1. Open Bruno → **Open Collection** → select the `api-docs/` folder
2. Select the **Local** environment
3. Fill in `walletId`, `senderWalletId`, `recipientWalletId` variables from seeded data

---

## Architecture Notes

### Atomic Transfers
Funds transfers use a **managed Sequelize transaction** (`sequelize.transaction()`) with `SELECT ... FOR UPDATE` row locks. Wallets are always locked in **sorted UUID order** to prevent deadlocks between concurrent reverse transfers.

### Append-Only Ledger
Every balance change writes a `wallet_ledgers` record in the **same transaction** as the balance update. The ledger is protected at three layers:
- PostgreSQL trigger (`trg_prevent_wallet_ledgers_mutation`) blocks `UPDATE`/`DELETE` at DB level
- Sequelize model `beforeUpdate`/`beforeDestroy` hooks throw at ORM level
- `WalletLedgerRepository.updateById()` / `deleteById()` throw at application level

### Idempotency
Redis `SET NX EX` is used to deduplicate concurrent or retried requests. Each operation scope (e.g. `wallet:transfer:<senderWalletId>:<recipientWalletId>`) maintains a **lock key** (cleared after completion) and a **done key** (retained for 24 hours).