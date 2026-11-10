import { loadEnvFile } from "node:process";
import { runMigrations } from "../src/server/db/migrate";

try {
  loadEnvFile(".env");
} catch {
  // .env может отсутствовать: тогда берём значения из окружения
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  await runMigrations(url);
  console.log("Миграции применены");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
