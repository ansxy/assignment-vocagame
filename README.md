# Node TS Clean API

Simple Node.js API boilerplate using TypeScript, PostgreSQL, Sequelize, and a clean layered structure.

## Layers

- `controllers`: translate HTTP requests into service calls
- `services`: implement business rules and orchestration
- `repositories`: isolate persistence access with a reusable base repository
- `models`: define Sequelize models
- `routes`: define endpoint mappings
- `shared`: shared errors and middleware

## Project Structure

```txt
src/
  app.ts
  server.ts
  config/
    env.ts
  database/
    init.ts
    sequelize.ts
  controllers/
    user.controller.ts
  repositories/
    base.repository.ts
    user.repository.ts
  routes/
    health.routes.ts
    user.routes.ts
  services/
    user.service.ts
  shared/
    errors/
      http-error.ts
    middleware/
      error-handler.ts
  types/
    user.ts
database/
  migrations/
  models/
    user.model.ts
  seeders/
    user.seeder.ts
```

## Run

```bash
Copy-Item .env.example .env
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

If you already have PostgreSQL running locally, just update the `.env` values.

## Example Endpoints

- `GET /api/health`
- `GET /api/users`
- `GET /api/users/:id`

## Repository Pattern

`BaseRepository` provides the common functions every repository can inherit:

- `findAll`
- `findById`
- `findOne`
- `create`
- `updateById`
- `deleteById`

Concrete repositories only need to extend the base class and add entity-specific queries.