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

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const weekdayIndex = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** «понедельник» по ключу даты. */
export function ruWeekday(key: string): string {
  return WEEKDAYS[weekdayIndex(key)];
}

/** «Пн» по ключу даты. */
export function ruWeekdayShort(key: string): string {
  return WEEKDAYS_SHORT[weekdayIndex(key)];
}

/** «Понедельник, 9 ноября». */
export function ruDayTitle(key: string): string {
  const day = ruWeekday(key);
  return `${day[0].toUpperCase()}${day.slice(1)}, ${ruDateKey(key)}`;
}

/** «09:05» — время по Москве. */
export function mskTime(d: Date): string {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(11, 16);
}

/** «09:00» → «9:00» (для текста; в карточках время с ведущим нулём). */
export function prettyTime(hhmm: string): string {
  return hhmm.startsWith("0") ? hhmm.slice(1) : hhmm;
}

/** «сегодня, 14:20» / «вчера, 23:10» / «5 ноября, 09:00» — по Москве. */
export function ruWhen(d: Date, now: Date): string {
  const key = mskDateKey(d);
  const today = mskDateKey(now);
  const day = key === today ? "сегодня" : key === shiftDateKey(today, -1) ? "вчера" : ruDateKey(key);
  return `${day}, ${mskTime(d)}`;
}

/** Форма слова для числа: plural(3, ["пара", "пары", "пар"]) → «пары». */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/** Сколько суток от одного ключа даты до другого. */
export function dayDiff(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** Приветствие по часу МСК: 5–11 утро, 12–16 день, 17–22 вечер, остальное ночь. */
export function greeting(now: Date): string {
  const h = new Date(now.getTime() + 3 * 3600_000).getUTCHours();
  if (h >= 5 && h <= 11) return "Доброе утро";
  if (h >= 12 && h <= 16) return "Добрый день";
  if (h >= 17 && h <= 22) return "Добрый вечер";
  return "Доброй ночи";
}

/** «Ковалёва Марина Анатольевна» → «Ковалёва М. А.» с неразрывными пробелами; одно слово — как есть. */
export function shortPersonName(full: string): string {
  const [last, ...rest] = full.trim().split(/\s+/);
  if (!rest.length) return last;
  return [last, ...rest.map((w) => `${w[0].toUpperCase()}.`)].join(" ");
}

/** «2-я пара»; после дефиса — word joiner (U+2060), чтобы «2-» и «я» не разъезжались по строкам. */
export function pairName(n: number): string {
  return `${n}-⁠я пара`;
}
