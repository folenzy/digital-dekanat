import postgres from "postgres";
import { localDatabaseUrl } from "./demo";

// Точечная правка демо-мира для сценария, которого не дождаться в тесте: срок ответа уже прошёл.
// Только локальная БД (localDatabaseUrl проверяет адрес); после файла демо-мир пересобирается.

/** Сдвигает срок ответа идущего обращения этого подтипа на `minutes` минут в прошлое; возвращает номер. */
export async function makeOverdue(typeCode: string, minutes: number): Promise<string> {
  const sql = postgres(localDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ number: string }[]>`
      update appeals set sla_due_at = now() - make_interval(mins => ${minutes})
      where type_code = ${typeCode} and status in ('submitted', 'in_progress')
      returning number`;
    if (rows.length !== 1) throw new Error(`Ожидалось одно идущее обращение ${typeCode}, найдено ${rows.length}`);
    return rows[0].number;
  } finally {
    await sql.end();
  }
}
