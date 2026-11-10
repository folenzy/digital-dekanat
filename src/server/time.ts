// Время бизнес-логики — Europe/Moscow (UTC+3, без перехода на летнее время).
const MSK_OFFSET_MS = 3 * 3600_000;
const DAY_MS = 86_400_000;

/** «HH:MM» → минуты от полуночи. */
export const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function mskShifted(d: Date): Date {
  return new Date(d.getTime() + MSK_OFFSET_MS);
}

/** Дата по Москве в формате 'YYYY-MM-DD'. */
export function mskDateKey(now: Date): string {
  return mskShifted(now).toISOString().slice(0, 10);
}

/** День недели по Москве: 1 = понедельник … 7 = воскресенье. */
export function mskWeekday(now: Date): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const d = mskShifted(now).getUTCDay(); // 0 = вс
  return (d === 0 ? 7 : d) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

// Понедельник недели 1 учебного года: 31 августа 2026 (1 сентября 2026 — вторник).
const WEEK_ONE_MONDAY_UTC = Date.UTC(2026, 7, 31);

/** Чётность учебной недели; 1 сентября 2026 = неделя 1 (нечётная). */
export function weekParity(date: Date): "odd" | "even" {
  const key = mskDateKey(date);
  const dayUtc = Date.parse(`${key}T00:00:00Z`);
  const mondayUtc = dayUtc - (mskWeekday(date) - 1) * DAY_MS;
  const weekIndex = Math.round((mondayUtc - WEEK_ONE_MONDAY_UTC) / (7 * DAY_MS)); // 0 = неделя 1
  return Math.abs(weekIndex) % 2 === 0 ? "odd" : "even";
}

/** 18:00 МСК n-го рабочего дня (пн–пт) после даты `from`; сам день `from` не считается. */
export function addWorkingDays(from: Date, n: number): Date {
  let dayUtc = Date.parse(`${mskDateKey(from)}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    dayUtc += DAY_MS;
    const wd = new Date(dayUtc).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return new Date(dayUtc + 18 * 3600_000 - MSK_OFFSET_MS);
}

export function isOverdue(due: Date, now: Date): boolean {
  return now.getTime() > due.getTime();
}

/** «13.11» — день и месяц по Москве (для текстов уведомлений). */
export function mskDdMm(d: Date): string {
  const key = mskDateKey(d);
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

/** Ключ даты 'YYYY-MM-DD', сдвинутый на n суток. */
export function shiftDateKey(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Момент времени «ГГГГ-ММ-ДД ЧЧ:ММ» по Москве. */
export function mskAt(key: string, hhmm: string): Date {
  return new Date(`${key}T${hhmm}:00+03:00`);
}

/** Минуты от полуночи по Москве (целые). */
export function mskMinutes(now: Date): number {
  const d = mskShifted(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
