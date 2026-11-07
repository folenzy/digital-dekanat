import postgres from "postgres";

// Общий клиент тестовой БД для всех интеграционных тестов.
export const testSql = postgres(process.env.DATABASE_URL_TEST!, { max: 5, onnotice: () => {} });

// Очищает все таблицы public (кроме журнала миграций drizzle) и сбрасывает sequence.
export async function truncateAll(): Promise<void> {
  const rows = await testSql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await testSql.unsafe(`truncate table ${list} restart identity cascade`);
  await testSql.unsafe("alter sequence appeal_number_seq restart with 1");
}

export async function closeTestDb(): Promise<void> {
  await testSql.end();
}
