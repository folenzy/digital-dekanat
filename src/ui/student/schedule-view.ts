import type { Lesson } from "@/server/schedule";

// Расписание: что показывать между парами и какими точками отмечать дни. Чистые функции.

export type Gap = { kind: "break" | "window"; label: string; duration: string };

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** «Перерыв · 10 мин» между соседними парами; от часа — «Окно · 2 ч 10 мин». Встык или внахлёст — null. */
export function gapBetween(prevEnd: string, nextStart: string): Gap | null {
  const a = toMinutes(prevEnd);
  const b = toMinutes(nextStart);
  if (a === null || b === null || b <= a) return null;
  const minutes = b - a;
  if (minutes < 60) return { kind: "break", label: "Перерыв", duration: `${minutes} мин` };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { kind: "window", label: "Окно", duration: m ? `${h} ч ${m} мин` : `${h} ч` };
}

const MAX_DOTS = 5;

/** Точки под днём недели: по одной на пару, цвет — по типу занятия. Отменённые пары не считаются. */
export function typeDots(lessons: readonly Lesson[]): Lesson["type"][] {
  return lessons.filter((l) => !l.cancelled).slice(0, MAX_DOTS).map((l) => l.type);
}

/** Короткий код типа занятия для плашки. */
export const LESSON_TYPE_CODE: Record<Lesson["type"], string> = {
  lecture: "ЛК",
  practice: "ПР",
  lab: "ЛБ",
};
