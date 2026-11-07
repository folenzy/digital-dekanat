import { afterAll, expect, test } from "vitest";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL_TEST!, { max: 1 });
afterAll(() => sql.end());

test("тестовая БД отвечает на select 1", async () => {
  const rows = await sql`select 1 as one`;
  expect(rows[0].one).toBe(1);
});
