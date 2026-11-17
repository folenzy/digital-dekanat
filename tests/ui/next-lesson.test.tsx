import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Lesson } from "@/server/schedule";
import { NextLesson, msToNextMinute } from "@/ui/student/NextLesson";
import type { NextLesson as Upcoming } from "@/ui/student/today";

// Блок «Следующая пара»: первый рендер идёт по nowIso сервера (без расхождения гидратации), тик минуты — чистая функция.
const TODAY = "2026-11-17"; // вторник
const lesson = (over: Partial<Lesson>): Lesson => ({
  pair: 2, start: "10:40", end: "12:10", discipline: "Математический анализ", type: "lecture",
  room: "А-301", building: "Корпус А", teacher: "Ковалёва Марина Анатольевна", cancelled: false, note: null, ...over,
});
const at = (hhmm: string) => `${TODAY}T${String(Number(hhmm.slice(0, 2)) - 3).padStart(2, "0")}:${hhmm.slice(3)}:00Z`;
const day = [
  lesson({ pair: 1, start: "08:30", end: "10:00", discipline: "Физика" }),
  lesson({}),
  lesson({ pair: 3, start: "14:20", end: "14:45", discipline: "Английский язык", type: "practice", room: "Б-12", building: null }),
];
const render = (lessons: Lesson[], nowIso: string, upcoming?: Upcoming) =>
  renderToStaticMarkup(<NextLesson lessons={lessons} todayKey={TODAY} upcoming={upcoming} nowIso={nowIso} />);
const plain = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\u2060/g, "").replace(/\u00a0/g, " ");

describe("NextLesson", () => {
  it("до пары: отсчёт, предмет, тип, время и место", () => {
    const out = render(day, at("10:15"));
    const t = plain(out);
    expect(t).toContain("Следующая пара");
    expect(t).toContain("через 25 мин");
    expect(t).toContain("Математический анализ");
    expect(t).toContain("ЛК");
    expect(t).toContain("2-я пара");
    expect(t).toContain("10:40–12:10");
    expect(t).toContain("А-301, корпус А");
  });

  it("полоса дня скрыта от скринридера, подпись — текстом", () => {
    const out = render(day, at("10:15"));
    expect(out).toMatch(/aria-hidden="true"[^>]*data-bar|data-bar[^>]*aria-hidden="true"/);
    expect(plain(out)).toContain("прошла 1 из 3 · до конца пар 4 ч 30 мин");
  });

  it("далеко до пары: «в 14:20» без «через»", () => {
    const t = plain(render([lesson({ pair: 3, start: "14:20", end: "15:50" })], at("09:00")));
    expect(t).toContain("в 14:20");
    expect(t).not.toContain("через");
  });

  it("во время пары: «Идёт сейчас», остаток и что дальше", () => {
    const t = plain(render(day, at("12:00")));
    expect(t).toContain("Идёт сейчас");
    expect(t).toContain("осталось 10 мин");
    expect(t).toContain("дальше — Английский язык, 14:20");
  });

  it("пары кончились: завтрашняя первая", () => {
    const next: Upcoming = { ...lesson({ start: "09:00", end: "10:30", discipline: "Дискретная математика" }), dateKey: "2026-11-18" };
    const t = plain(render(day, at("16:00"), next));
    expect(t).toContain("На сегодня всё. Завтра первая — 9:00, Дискретная математика");
  });

  it("сегодня пар нет: ближайшая в понедельник", () => {
    const next: Upcoming = { ...lesson({ start: "09:00", end: "10:30", discipline: "Дискретная математика" }), dateKey: "2026-11-23" };
    const out = render([], at("12:00"), next);
    expect(plain(out)).toContain("Следующая пара — в понедельник, 9:00, Дискретная математика");
  });

  it("ничего нет — пустая разметка", () => {
    expect(render([], at("12:00"))).toBe("");
  });

  it("рамка, а не заливка; ссылка на день; без aria-live", () => {
    const out = render(day, at("10:15"));
    expect(out).not.toContain('data-surface="ink"');
    expect(out).not.toContain("aria-live");
    expect(out).toContain(`href="/schedule?view=day&amp;date=${TODAY}"`);
  });
});

describe("msToNextMinute", () => {
  it("миллисекунды до границы следующей минуты", () => {
    expect(msToNextMinute(new Date("2026-11-17T07:15:20.500Z"))).toBe(39_500);
    expect(msToNextMinute(new Date("2026-11-17T07:15:00.000Z"))).toBe(60_000);
  });
});
