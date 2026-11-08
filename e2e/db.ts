import postgres from "postgres";
import { localDatabaseUrl } from "./demo";

// Только чтение: e2e сверяет, что данные не изменились после попытки взлома. Адрес — тот же локальный, что у сервера.

/** Выполняет запрос на чтение и закрывает соединение. */
export async function readRows<T extends object>(query: (sql: postgres.Sql) => Promise<T[]>): Promise<T[]> {
  const sql = postgres(localDatabaseUrl(), { max: 1 });
  try {
    return await query(sql);
  } finally {
    await sql.end();
  }
}

/** Снимок обращения и его переписки: по нему видно любое изменение (статус, сообщения, события). */
export async function appealSnapshot(appealId: string): Promise<string> {
  const rows = await readRows(async (sql) => sql`
    select
      (select row_to_json(a) from appeals a where a.id = ${appealId}) as appeal,
      (select coalesce(json_agg(m order by m.id), '[]'::json) from appeal_messages m where m.appeal_id = ${appealId}) as messages,
      (select coalesce(json_agg(e order by e.id), '[]'::json) from appeal_events e where e.appeal_id = ${appealId}) as events`);
  return JSON.stringify(rows[0]);
}
