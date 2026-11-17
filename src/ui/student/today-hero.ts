import type { Lesson } from "@/server/schedule";
import { mskMinutes, toMin } from "@/server/time";
import type { NextLesson } from "./today";

// Состояние блока «Следующая пара» на экране «Сегодня». Чистая функция: без БД и React, время — МСК.

export type DayProgress = {
  /** Неотменённых пар сегодня. */
  total: number;
  /** Сколько уже закончилось. */
  passed: number;
  /** 0..1 — доля прошедшего времени идущей пары (0, если пара не идёт). */
  currentShare: number;
  /** Минут до конца последней неотменённой пары (0, если все закончились). */
  leftMinutes: number;
};

export type TodayHero =
  | { kind: "before"; lesson: NextLesson; minutes: number | null; progress: DayProgress }
  | { kind: "during"; lesson: NextLesson; minutesLeft: number; after: NextLesson | null; progress: DayProgress }
  | { kind: "done"; next: NextLesson | null }
  | { kind: "free"; next: NextLesson }
  | null;

/** Если до начала 180 минут и больше (в брифе 06:00 при паре в 09:00 → null), показываем «в HH:MM», а не «через N мин». */
const SOON_MINUTES = 180;

// То же правило, что в LessonCard/Agenda: отменена флагом или заменой «отменена».
const isCancelled = (l: Lesson): boolean => l.cancelled || l.change?.kind === "cancelled";

/**
 * `upcoming` — ближайшая пара из getTodayOverview: может быть и сегодняшней (её уже видно в todayLessons).
 * `nextStudyDay` — первая пара следующего учебного дня после сегодняшнего; только она годится для «done»/«free».
 * Без неё берём `upcoming`, лишь если он не сегодняшний.
 */
export function todayHero(
  todayLessons: readonly Lesson[], todayKey: string, upcoming: NextLesson | undefined, now: Date,
  nextStudyDay?: NextLesson,
): TodayHero {
  const later = nextStudyDay ?? (upcoming && upcoming.dateKey !== todayKey ? upcoming : undefined);
  const active = todayLessons.filter((l) => !isCancelled(l)).sort((a, b) => toMin(a.start) - toMin(b.start));
  if (!active.length) return later ? { kind: "free", next: later } : null;

  // Минуты от полуночи с секундами: 10:14:30 → 614.5, чтобы «осталось» округлялось вверх.
  const t = mskMinutes(now) + (Math.floor(now.getTime() / 1000) % 60) / 60;
  const today = (l: Lesson): NextLesson => ({ ...l, dateKey: todayKey });

  const current = active.find((l) => toMin(l.start) <= t && t < toMin(l.end));
  const next = active.find((l) => toMin(l.start) > t);
  const last = active[active.length - 1];

  const progress: DayProgress = {
    total: active.length,
    passed: active.filter((l) => toMin(l.end) <= t).length,
    currentShare: current ? (t - toMin(current.start)) / (toMin(current.end) - toMin(current.start)) : 0,
    leftMinutes: Math.max(0, Math.ceil(toMin(last.end) - t)),
  };

  if (current) {
    const after = active.find((l) => toMin(l.start) >= toMin(current.end));
    return {
      kind: "during", lesson: today(current), minutesLeft: Math.ceil(toMin(current.end) - t),
      after: after ? today(after) : null, progress,
    };
  }
  if (next) {
    const minutes = Math.ceil(toMin(next.start) - t);
    return { kind: "before", lesson: today(next), minutes: minutes >= SOON_MINUTES ? null : minutes, progress };
  }
  return { kind: "done", next: later ?? null };
}
