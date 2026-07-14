# Database Migrations

Schema changes belong in migration files under `src/db/migrations/`.
Create them with:

```sh
npm run db:migration:create --name=add_embedding_index
```

In local development, run pending migrations manually with:

```sh
npm run db:migration:up
```

Production startup applies pending migrations automatically.

Use `db:migration:fresh` only for local development. It drops app
tables, then runs all migrations so the DB is immediately usable:

```sh
npm run db:migration:fresh
```

Never run `db:migration:fresh` in production.

Built-in model catalog rows live in migrations. Add, retire, or correct default
models with a new forward migration.

Use `db:migration:status` to inspect which migration files have already run.
