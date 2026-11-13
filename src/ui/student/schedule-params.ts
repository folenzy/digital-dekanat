import { dayDiff, ruDateKey, ruWeekdayShort } from "@/server/format";
import { mskDateKey, shiftDateKey } from "@/server/time";

// Параметры страницы «Пары» из адреса: ?view=day|week&date=YYYY-MM-DD. Всё неверное → значения по умолчанию.

export type ScheduleView = "day" | "week";
export type ScheduleParams = { view: ScheduleView; dateKey: string; today: string };

type Raw = string | string[] | undefined;

/** Дальше года от сегодня расписание не показываем: демо-мир строится вокруг «сегодня». */
const MAX_DAYS = 366;

function validDateKey(raw: Raw, today: string): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const t = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== raw) return null; // 2026-02-30
  return Math.abs(dayDiff(today, raw)) <= MAX_DAYS ? raw : null;
}

const isSunday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay() === 0;

/** Учебная неделя — пн–сб, поэтому воскресенье показываем как следующий понедельник. */
export function parseScheduleParams(sp: { view?: Raw; date?: Raw }, now: Date): ScheduleParams {
  const today = mskDateKey(now);
  const view: ScheduleView = sp.view === "week" ? "week" : "day";
  const key = validDateKey(sp.date, today) ?? today;
  return { view, dateKey: isSunday(key) ? shiftDateKey(key, 1) : key, today };
}

/** Понедельник недели, в которую попадает дата (пн–вс). */
export function mondayOf(key: string): string {
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = вс
  return shiftDateKey(key, -((wd + 6) % 7));
}

/** «9–14 ноября» или «30 ноября – 5 декабря» для недели пн–сб. */
export function weekLabel(mondayKey: string): string {
  const saturday = shiftDateKey(mondayKey, 5);
  if (mondayKey.slice(5, 7) === saturday.slice(5, 7)) {
    return `${Number(mondayKey.slice(8, 10))}–${ruDateKey(saturday)}`;
  }
  return `${ruDateKey(mondayKey)} – ${ruDateKey(saturday)}`;
}

/** Адрес страницы «Пары» с параметрами. */
export function scheduleHref(view: ScheduleView, dateKey: string): string {
  return `/schedule?view=${view}&date=${dateKey}`;
}

export type ScheduleNeighbor = { href: string; label: string };

/**
 * Куда ведёт листание пальцем на странице «Пары»: в виде «День» — соседний учебный день (воскресенье
 * пропускаем: после субботы идёт понедельник), в виде «Неделя» — соседняя неделя. Подпись — для подсказки
 * у края экрана. Дальше года от сегодня листать некуда: страница такую дату не покажет.
 */
export function scheduleNeighbors(
  view: ScheduleView, dateKey: string, today: string,
): { prev: ScheduleNeighbor | null; next: ScheduleNeighbor | null } {
  const inRange = (key: string) => Math.abs(dayDiff(today, key)) <= MAX_DAYS;
  const step = (dir: 1 | -1): ScheduleNeighbor | null => {
    if (view === "week") {
      const key = shiftDateKey(dateKey, 7 * dir);
      return inRange(key) ? { href: scheduleHref("week", key), label: weekLabel(mondayOf(key)) } : null;
    }
    let key = shiftDateKey(dateKey, dir);
    if (isSunday(key)) key = shiftDateKey(key, dir);
    return inRange(key) ? { href: scheduleHref("day", key), label: `${ruWeekdayShort(key)}, ${ruDateKey(key)}` } : null;
  };
  return { prev: step(-1), next: step(1) };
}
