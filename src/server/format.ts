import { mskDateKey, shiftDateKey } from "./time";

// Русские даты для текстов карточек и экранов (всё по Москве, без зависимости от Intl и локали сервера).

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «20 ноября» по ключу даты 'YYYY-MM-DD'. */
export function ruDateKey(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS_GEN[Number(key.slice(5, 7)) - 1]}`;
}

/** «20 ноября» — день и месяц момента времени по Москве. */
export function ruDate(d: Date): string {
  return ruDateKey(mskDateKey(d));
}

/** «сегодня» / «завтра» / «20 ноября» относительно `now` (по Москве). */
export function ruRelativeDate(d: Date, now: Date): string {
  const key = mskDateKey(d);
  const today = mskDateKey(now);
  if (key === today) return "сегодня";
  if (key === shiftDateKey(today, 1)) return "завтра";
  return ruDateKey(key);
}

/** Среднее с запятой: 4.8 → «4,8», 4.67 → «4,67». */
export function formatAverage(n: number): string {
  return String(n).replace(".", ",");
}
