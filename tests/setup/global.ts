import postgres from "postgres";
import { runMigrations } from "../../src/server/db/migrate";

// Проверяем тестовую БД и накатываем миграции перед всеми тестами.
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST не задан (см. .env.example)");
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await sql`select 1`;
  } catch (e) {
    throw new Error(
      `Тестовая БД недоступна по DATABASE_URL_TEST. Запусти: npm run db:up. ${(e as Error).message}`,
    );
  } finally {
    await sql.end();
  }
  await runMigrations(url);
}
