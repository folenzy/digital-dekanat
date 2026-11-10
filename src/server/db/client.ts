import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let _sql: postgres.Sql | undefined;
let _db: Db | undefined;

function getSql(): postgres.Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL не задан");
    _sql = postgres(url, { max: 10, onnotice: () => {} });
  }
  return _sql;
}

function getDb(): Db {
  return (_db ??= drizzle(getSql(), { schema }));
}

// Ленивые прокси: соединение создаётся при первом обращении, а не при импорте.
export const db: Db = new Proxy({} as Db, {
  get: (_t, p) => Reflect.get(getDb(), p, getDb()),
});

export const sql: postgres.Sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  get: (_t, p) => Reflect.get(getSql(), p, getSql()),
  apply: (_t, _this, args) => (getSql() as unknown as (...a: unknown[]) => unknown)(...args),
});
