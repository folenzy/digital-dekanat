import { describe, expect, it } from "vitest";
import { addWorkingDays, isOverdue, mskDateKey, mskWeekday, weekParity } from "@/server/time";

describe("время МСК", () => {
  it("mskDateKey переходит на следующий день после 21:00 UTC", () => {
    expect(mskDateKey(new Date("2026-11-07T21:30:00Z"))).toBe("2026-11-08");
    expect(mskDateKey(new Date("2026-11-07T20:59:00Z"))).toBe("2026-11-07");
  });

  it("mskWeekday: 1 = понедельник, 7 = воскресенье", () => {
    expect(mskWeekday(new Date("2026-11-07T12:00:00Z"))).toBe(6); // суббота
    expect(mskWeekday(new Date("2026-11-08T12:00:00Z"))).toBe(7);
    expect(mskWeekday(new Date("2026-11-09T12:00:00Z"))).toBe(1);
    expect(mskWeekday(new Date("2026-11-08T21:30:00Z"))).toBe(1); // уже понедельник по МСК
  });

  it("weekParity: 1 сентября 2026 — нечётная неделя", () => {
    expect(weekParity(new Date("2026-09-01T09:00:00Z"))).toBe("odd");
    expect(weekParity(new Date("2026-09-08T09:00:00Z"))).toBe("even");
    expect(weekParity(new Date("2026-09-06T09:00:00Z"))).toBe("odd"); // воскресенье той же недели
    expect(weekParity(new Date("2026-08-28T09:00:00Z"))).toBe("even"); // неделя до начала отсчёта
  });

  it("addWorkingDays: 18:00 МСК n-го рабочего дня, день from не считается", () => {
    expect(addWorkingDays(new Date("2026-11-07T12:00:00Z"), 1).toISOString()).toBe("2026-11-09T15:00:00.000Z"); // сб -> пн
    expect(addWorkingDays(new Date("2026-11-06T12:00:00Z"), 1).toISOString()).toBe("2026-11-09T15:00:00.000Z"); // пт -> пн
    expect(addWorkingDays(new Date("2026-11-09T07:00:00Z"), 3).toISOString()).toBe("2026-11-12T15:00:00.000Z"); // пн -> чт
    expect(addWorkingDays(new Date("2026-11-04T07:00:00Z"), 3).toISOString()).toBe("2026-11-09T15:00:00.000Z"); // ср -> пн
  });

  it("isOverdue: срок прошёл строго раньше now", () => {
    const due = new Date("2026-11-09T15:00:00Z");
    expect(isOverdue(due, new Date("2026-11-09T15:00:01Z"))).toBe(true);
    expect(isOverdue(due, new Date("2026-11-09T14:59:00Z"))).toBe(false);
  });
});
