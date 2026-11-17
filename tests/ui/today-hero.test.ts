import { describe, expect, it } from "vitest";
import type { Lesson } from "@/server/schedule";
import type { NextLesson } from "@/ui/student/today";
import { todayHero } from "@/ui/student/today-hero";

// Блок «Следующая пара»: чистая функция, время по Москве (UTC+3).
const msk = (iso: string) => new Date(`${iso}+03:00`);
const TODAY = "2026-11-17";

const lesson = (over: Partial<Lesson>): Lesson => ({
  pair: 1, start: "09:00", end: "10:30", discipline: "Математический анализ", type: "lecture",
  room: "А-301", building: "Корпус А", teacher: "Ковалёва Марина Анатольевна", cancelled: false, note: null, ...over,
});
const P1 = lesson({ pair: 1, start: "09:00", end: "10:30" });
const P2 = lesson({ pair: 2, start: "10:40", end: "12:10" });
const P3 = lesson({ pair: 3, start: "12:40", end: "14:10" });
const DAY = [P1, P2, P3];
const at = (l: Lesson, dateKey = TODAY): NextLesson => ({ ...l, dateKey });
const TOMORROW = at(lesson({ pair: 1, start: "09:00", end: "10:30" }), "2026-11-18");
const MONDAY = at(lesson({ pair: 1, start: "09:00", end: "10:30" }), "2026-11-23");

describe("todayHero", () => {
  it("идёт пара 1: during, следом пара 2, прогресс дня", () => {
    const h = todayHero(DAY, TODAY, undefined, msk("2026-11-17T10:15:00"));
    expect(h).toMatchObject({ kind: "during", minutesLeft: 15 });
    if (h?.kind !== "during") throw new Error("ожидали during");
    expect(h.lesson.pair).toBe(1);
    expect(h.after?.pair).toBe(2);
    expect(h.progress).toEqual({ total: 3, passed: 0, currentShare: 75 / 90, leftMinutes: 235 });
  });

  it("10:30 ровно: пара 1 закончилась, before пары 2 через 10 минут", () => {
    const h = todayHero(DAY, TODAY, undefined, msk("2026-11-17T10:30:00"));
    expect(h).toMatchObject({ kind: "before", minutes: 10 });
    if (h?.kind !== "before") throw new Error("ожидали before");
    expect(h.lesson.pair).toBe(2);
    expect(h.progress.passed).toBe(1);
    expect(h.progress.currentShare).toBe(0);
  });

  it("09:00 ровно: уже during, осталось 90", () => {
    const h = todayHero(DAY, TODAY, undefined, msk("2026-11-17T09:00:00"));
    expect(h).toMatchObject({ kind: "during", minutesLeft: 90 });
  });

  it("отменённая пара 2 пропускается: after — пара 3, total 2", () => {
    const day = [P1, lesson({ ...P2, cancelled: true }), P3];
    const h = todayHero(day, TODAY, undefined, msk("2026-11-17T10:15:00"));
    if (h?.kind !== "during") throw new Error("ожидали during");
    expect(h.after?.pair).toBe(3);
    expect(h.progress.total).toBe(2);
  });

  it("отмена через change.kind тоже считается отменой", () => {
    const changed = { ...P2, change: { kind: "cancelled" } } as unknown as Lesson;
    const h = todayHero([P1, changed, P3], TODAY, undefined, msk("2026-11-17T10:15:00"));
    if (h?.kind !== "during") throw new Error("ожидали during");
    expect(h.after?.pair).toBe(3);
  });

  it("до первой пары: больше 180 минут — minutes null, иначе минуты", () => {
    const early = todayHero(DAY, TODAY, undefined, msk("2026-11-17T06:00:00"));
    expect(early).toMatchObject({ kind: "before", minutes: null });
    const near = todayHero(DAY, TODAY, undefined, msk("2026-11-17T08:00:00"));
    expect(near).toMatchObject({ kind: "before", minutes: 60 });
    expect(todayHero(DAY, TODAY, undefined, msk("2026-11-17T06:01:00"))).toMatchObject({ minutes: 179 });
  });

  it("после последней пары: done, next — завтрашняя или null", () => {
    expect(todayHero(DAY, TODAY, TOMORROW, msk("2026-11-17T14:10:00"))).toEqual({ kind: "done", next: TOMORROW });
    expect(todayHero(DAY, TODAY, TOMORROW, msk("2026-11-17T20:00:00"))).toEqual({ kind: "done", next: TOMORROW });
    expect(todayHero(DAY, TODAY, undefined, msk("2026-11-17T15:00:00"))).toEqual({ kind: "done", next: null });
  });

  it("сегодня пар нет: free с ближайшей или null", () => {
    expect(todayHero([], TODAY, MONDAY, msk("2026-11-17T12:00:00"))).toEqual({ kind: "free", next: MONDAY });
    expect(todayHero([], TODAY, undefined, msk("2026-11-17T12:00:00"))).toBeNull();
  });

  it("все сегодняшние пары отменены — как день без пар", () => {
    const day = DAY.map((l) => lesson({ ...l, cancelled: true }));
    expect(todayHero(day, TODAY, MONDAY, msk("2026-11-17T10:00:00"))).toEqual({ kind: "free", next: MONDAY });
  });

  it("минуты округляются вверх: 10:14:30 → осталось 16", () => {
    const h = todayHero(DAY, TODAY, undefined, msk("2026-11-17T10:14:30"));
    expect(h).toMatchObject({ kind: "during", minutesLeft: 16 });
  });
});
