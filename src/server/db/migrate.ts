import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";

/**
 * Папка с SQL-миграциями drizzle. В образе Docker её задаёт MIGRATIONS_DIR (deploy/Dockerfile);
 * скрипты и тесты запускаются из корня репозитория, там это ./drizzle.
 */
export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR || path.resolve(process.cwd(), "drizzle");
}

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.end();
  }
}
