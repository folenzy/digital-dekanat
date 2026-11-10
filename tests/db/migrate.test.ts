import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrationsFolder, runMigrations } from "@/server/db/migrate";

// В образе Docker путь к drizzle/ задаёт MIGRATIONS_DIR, а не текущая папка процесса.
describe("migrationsFolder", () => {
  const saved = process.env.MIGRATIONS_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.MIGRATIONS_DIR;
    else process.env.MIGRATIONS_DIR = saved;
  });

  it("без MIGRATIONS_DIR — drizzle/ в текущей папке (скрипты и тесты из корня репозитория)", () => {
    delete process.env.MIGRATIONS_DIR;
    expect(migrationsFolder()).toBe(path.resolve(process.cwd(), "drizzle"));
  });

  it("MIGRATIONS_DIR задан — берётся он, а не текущая папка", async () => {
    process.env.MIGRATIONS_DIR = path.resolve(process.cwd(), "no-such-migrations");
    expect(migrationsFolder()).toBe(process.env.MIGRATIONS_DIR);
    // в настоящей ./drizzle журнал есть, значит ошибка — от папки из MIGRATIONS_DIR
    await expect(runMigrations(process.env.DATABASE_URL_TEST!)).rejects.toThrow("Can't find meta/_journal.json");
  });
});
