import postgres from "postgres";
import { localDatabaseUrl } from "./demo";

// Детерминированное расписание «на сегодня» для группы Алины: не зависит от дня недели (в том числе выходных).
// Шаблонные пары сегодняшнего дня отменяем и добавляем три дополнительные известные пары.
// Пишем только в локальную БД (адрес проверяет localDatabaseUrl). Сбрасывается resetDemoWorld().

/** Известные пары: номер, начало и конец в минутах от полуночи по МСК (как в PAIR_TIMES). */
export const SEEDED_LESSONS = [
  { pair: 1, start: 9 * 60, end: 10 * 60 + 30 },
  { pair: 2, start: 10 * 60 + 40, end: 12 * 60 + 10 },
  { pair: 4, start: 14 * 60 + 20, end: 15 * 60 + 50 },
] as const;

export const mskToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

/** Время браузера: сегодняшняя дата по МСК и минуты от полуночи. */
export const mskAt = (key: string, minutes: number) =>
  new Date(`${key}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+03:00`);

export async function seedTodayLessons(login = "alina.mironova"): Promise<string> {
  const key = mskToday();
  const sql = postgres(localDatabaseUrl(), { max: 1 });
  try {
    const [g] = await sql`select s.group_id as id from students s join users u on u.id = s.user_id where u.login = ${login}`;
    const discs = await sql`select id from disciplines order by id limit 3`;
    const [room] = await sql`select id from rooms order by id limit 1`;
    const [teacher] = await sql`select id from teachers order by id limit 1`;
    if (!g || !discs.length || !room || !teacher) throw new Error("демо-мир не собран");
    await sql`delete from schedule_changes where group_id = ${g.id} and date = ${key}`;
    // отмены — первыми: они применяются к шаблону, а не к дополнительным парам (порядок по id)
    for (const pair of [1, 2, 3, 4, 5, 6]) {
      await sql`insert into schedule_changes (group_id, date, pair, kind) values (${g.id}, ${key}, ${pair}, 'cancelled')`;
    }
    for (const [i, l] of SEEDED_LESSONS.entries()) {
      await sql`insert into schedule_changes (group_id, date, pair, kind, discipline_id, lesson_type, new_room_id, new_teacher_id)
        values (${g.id}, ${key}, ${l.pair}, 'extra', ${discs[i % discs.length].id}, 'lecture', ${room.id}, ${teacher.id})`;
    }
  } finally {
    await sql.end();
  }
  return key;
}
