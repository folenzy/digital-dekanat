import { describe, expect, it } from "vitest";
import {
  dayDiff, greeting, pairName, mskTime, plural, prettyTime, ruDayTitle, ruWeekday, ruWeekdayShort, ruWhen, shortPersonName,
} from "@/server/format";
import type { AppealListItem } from "@/server/appeals/types";
import type { Lesson } from "@/server/schedule";
import { buildingName, CHANGE_META, gradeLabel, LESSON_TYPE_LABEL, VERDICT_COPY } from "@/ui/student/labels";
import { parseScheduleParams, weekLabel } from "@/ui/student/schedule-params";
import { appealPromise, nextDayLabel, nextLessonPhrase, todaySummary } from "@/ui/student/today";
import { isSafeHref } from "@/ui/safe-href";

// Тексты экранов студента: чистые функции, без БД. Время — по Москве (UTC+3).
const msk = (iso: string) => new Date(`${iso}+03:00`);
const SUN = msk("2026-11-08T12:00:00"); // воскресенье
const MON_EARLY = msk("2026-11-09T08:00:00"); // понедельник до первой пары

const lesson = (over: Partial<Lesson>): Lesson => ({
  pair: 2, start: "10:40", end: "12:10", discipline: "Математический анализ", type: "lecture",
  room: "А-301", building: "Корпус А", teacher: "Ковалёва Марина Анатольевна", cancelled: false, note: null, ...over,
});

const appeal = (over: Partial<AppealListItem>): AppealListItem => ({
  id: "00000000-0000-4000-8000-000000000001", number: "О-2026-000001",
  type: { code: "cert_military", title: "Справка для военкомата", topic: "certificates", kind: "certificate" },
  department: { id: 1, code: "docs", name: "Справки и документы" },
  status: "in_progress", slaDueAt: msk("2026-11-09T18:00:00"), overdue: false,
  createdAt: msk("2026-11-08T10:00:00"), updatedAt: msk("2026-11-08T10:20:00"), ...over,
});

describe("приветствие по часу МСК", () => {
  it.each([
    ["2026-11-09T05:00:00", "Доброе утро"],
    ["2026-11-09T11:59:00", "Доброе утро"],
    ["2026-11-09T12:00:00", "Добрый день"],
    ["2026-11-09T16:59:00", "Добрый день"],
    ["2026-11-09T17:00:00", "Добрый вечер"],
    ["2026-11-09T22:59:00", "Добрый вечер"],
    ["2026-11-09T23:00:00", "Доброй ночи"],
    ["2026-11-09T04:59:00", "Доброй ночи"],
  ])("%s → %s", (iso, text) => {
    expect(greeting(msk(iso))).toBe(text);
  });

  it("сервер в UTC: 21:30 UTC — это уже 00:30 по Москве, ночь", () => {
    expect(greeting(new Date("2026-11-09T21:30:00Z"))).toBe("Доброй ночи");
    expect(greeting(new Date("2026-11-09T06:00:00Z"))).toBe("Доброе утро"); // 09:00 МСК
  });
});

describe("даты и время по-русски", () => {
  it("дни недели и заголовок дня", () => {
    expect(ruWeekday("2026-11-08")).toBe("воскресенье");
    expect(ruWeekday("2026-11-09")).toBe("понедельник");
    expect(ruWeekdayShort("2026-11-14")).toBe("Сб");
    expect(ruDayTitle("2026-11-09")).toBe("Понедельник, 9 ноября");
  });

  it("время: с ведущим нулём в карточках, без него в тексте", () => {
    expect(mskTime(new Date("2026-11-09T06:05:00Z"))).toBe("09:05");
    expect(prettyTime("09:00")).toBe("9:00");
    expect(prettyTime("12:40")).toBe("12:40");
  });

  it("когда: сегодня, вчера, дата", () => {
    const now = msk("2026-11-09T15:00:00");
    expect(ruWhen(msk("2026-11-09T14:20:00"), now)).toBe("сегодня, 14:20");
    expect(ruWhen(msk("2026-11-08T23:10:00"), now)).toBe("вчера, 23:10");
    expect(ruWhen(msk("2026-11-05T09:00:00"), now)).toBe("5 ноября, 09:00");
  });

  it("«2-я пара» не разрывается между строками (word joiner после дефиса)", () => {
    expect(pairName(2)).toBe("2-⁠я пара");
  });

  it("склонение и разница дат", () => {
    const pairs: [string, string, string] = ["пара", "пары", "пар"];
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, pairs))).toEqual(
      ["пара", "пары", "пар", "пар", "пара", "пары", "пар"],
    );
    expect(dayDiff("2026-11-08", "2026-11-13")).toBe(5);
    expect(dayDiff("2026-11-08", "2026-11-08")).toBe(0);
  });

  it("преподаватель коротко, инициалы не разрываются", () => {
    expect(shortPersonName("Ковалёва Марина Анатольевна")).toBe("Ковалёва М. А.");
    expect(shortPersonName("Иванов Пётр")).toBe("Иванов П.");
    expect(shortPersonName("уточняется")).toBe("уточняется");
  });
});

describe("подписи", () => {
  it("бейджи изменений расписания", () => {
    expect(Object.values(CHANGE_META).map((m) => m.label)).toEqual([
      "Перенос", "Отменена", "Замена преподавателя", "Новая аудитория", "Доп. занятие",
    ]);
    expect(CHANGE_META.cancelled.tone).toBe("danger");
  });

  it("корпус: со строчной, буква корпуса не отрывается", () => {
    expect(buildingName("Корпус А")).toBe("корпус А");
  });

  it("тип занятия, оценка, вердикт", () => {
    expect(LESSON_TYPE_LABEL.lab).toBe("Лабораторная");
    expect(gradeLabel("5")).toBe("5, отлично");
    expect(gradeLabel("2")).toBe("2, неудовлетворительно");
    expect(gradeLabel("зачёт")).toBe("зачёт");
    expect([VERDICT_COPY.good.title, VERDICT_COPY.risks.title, VERDICT_COPY.debts.title])
      .toEqual(["Всё идёт хорошо", "Есть риски", "Есть долги"]);
  });
});

describe("сводка на «Сегодня»", () => {
  const three = [
    lesson({ pair: 1, start: "09:00", end: "10:30" }),
    lesson({ pair: 2, start: "10:40", end: "12:10" }),
    lesson({ pair: 3, start: "12:40", end: "14:10", room: "А-215" }),
  ];

  it("до первой пары: сколько пар и когда первая", () => {
    const text = todaySummary({ lessons: three, next: { ...three[0], dateKey: "2026-11-09" }, appeals: [] }, MON_EARLY);
    expect(text).toBe("Сегодня три пары, первая в 9:00.");
  });

  it("идёт пара", () => {
    const now = msk("2026-11-09T11:00:00");
    const text = todaySummary({
      lessons: three, current: three[1], next: { ...three[2], dateKey: "2026-11-09" }, appeals: [],
    }, now);
    expect(text).toBe(`Сейчас идёт ${pairName(2)}, закончится в 12:10.`);
  });

  it("перерыв между парами", () => {
    const now = msk("2026-11-09T12:20:00");
    const text = todaySummary({ lessons: three, next: { ...three[2], dateKey: "2026-11-09" }, appeals: [] }, now);
    expect(text).toBe("Следующая пара в 12:40, ауд. А-215.");
  });

  it("пары закончились — когда следующая", () => {
    const now = msk("2026-11-09T15:00:00");
    const text = todaySummary({ lessons: three, next: { ...three[0], dateKey: "2026-11-10" }, appeals: [] }, now);
    expect(text).toBe(`Пары на сегодня закончились. Следующая — завтра, ${pairName(1)} в 9:00.`);
  });

  it("выходной: про пары говорит блок «Пары сегодня», сводка — только про дела", () => {
    const next = { ...lesson({}), dateKey: "2026-11-09" };
    expect(todaySummary({ lessons: [], next, appeals: [] }, SUN)).toBe("Срочных дел нет.");
    expect(todaySummary({ lessons: [], next, appeals: [appeal({})] }, SUN))
      .toBe("Обращение в работе, ответ завтра до 18:00.");
    expect(nextLessonPhrase(next, SUN)).toBe(`завтра, ${pairName(2)} в 10:40`);
    expect(nextLessonPhrase({ ...next, dateKey: "2026-11-16" }, SUN)).toBe(`понедельник, 16 ноября, ${pairName(2)} в 10:40`);
  });

  it("все пары отменены — как выходной", () => {
    const text = todaySummary({ lessons: [lesson({ cancelled: true })], appeals: [] }, MON_EARLY);
    expect(text).toBe("Срочных дел нет.");
  });

  it("обращения: уточнение важнее, затем готово, затем срок ответа", () => {
    const base = { lessons: three, next: { ...three[0], dateKey: "2026-11-09" } };
    expect(todaySummary({ ...base, appeals: [appeal({ status: "needs_info" }), appeal({ status: "ready" })] }, MON_EARLY))
      .toBe("Сегодня три пары, первая в 9:00. По одному обращению деканат ждёт твоего ответа.");
    expect(todaySummary({ ...base, appeals: [appeal({ status: "needs_info" }), appeal({ status: "needs_info" })] }, MON_EARLY))
      .toContain("По двум обращениям деканат ждёт твоего ответа.");
    expect(todaySummary({ ...base, appeals: [appeal({ status: "ready" })] }, MON_EARLY))
      .toContain("Справка готова, её можно забрать.");
    expect(todaySummary({ ...base, appeals: [appeal({})] }, SUN))
      .toContain("Обращение в работе, ответ завтра до 18:00.");
  });
});

describe("подпись дня следующих пар — чтобы завтрашнее не спутать с сегодняшним", () => {
  // 2026-11-11 — среда
  const WED = new Date("2026-11-11T15:00:00Z");

  it("завтра и послезавтра называются словами", () => {
    expect(nextDayLabel("2026-11-12", WED)).toBe("Завтра");
    expect(nextDayLabel("2026-11-13", WED)).toBe("Послезавтра");
  });

  it("дальше — день недели с правильным предлогом", () => {
    expect(nextDayLabel("2026-11-14", WED)).toBe("В субботу");
    expect(nextDayLabel("2026-11-16", WED)).toBe("В понедельник");
    expect(nextDayLabel("2026-11-17", WED)).toBe("Во вторник");
    expect(nextDayLabel("2026-11-18", WED)).toBe("В среду");
    expect(nextDayLabel("2026-11-20", WED)).toBe("В пятницу");
  });

  it("поздним вечером по Москве «завтра» считается от московской даты, а не от UTC", () => {
    // 21:30 UTC среды — в Москве уже четверг, 00:30
    const lateWed = new Date("2026-11-11T21:30:00Z");
    expect(nextDayLabel("2026-11-13", lateWed)).toBe("Завтра");
  });
});

describe("срок ответа по обращению", () => {
  it("человеческие формулировки", () => {
    expect(appealPromise(appeal({}), SUN)).toEqual({ text: "Ответ завтра до 18:00", tone: "muted" });
    expect(appealPromise(appeal({ overdue: true }), msk("2026-11-10T10:00:00")))
      .toEqual({ text: "Срок ответа прошёл: обещали вчера до 18:00", tone: "danger" });
    expect(appealPromise(appeal({ status: "needs_info" }), SUN).tone).toBe("warn");
    expect(appealPromise(appeal({ status: "ready" }), SUN))
      .toEqual({ text: "Можно забирать, где и до какого числа — в обращении", tone: "ok" });
  });
});

describe("параметры расписания", () => {
  it("по умолчанию — день, сегодня; воскресенье → понедельник", () => {
    expect(parseScheduleParams({}, MON_EARLY)).toEqual({ view: "day", dateKey: "2026-11-09", today: "2026-11-09" });
    expect(parseScheduleParams({}, SUN)).toEqual({ view: "day", dateKey: "2026-11-09", today: "2026-11-08" });
  });

  it("валидные значения принимаются", () => {
    expect(parseScheduleParams({ view: "week", date: "2026-11-12" }, SUN))
      .toMatchObject({ view: "week", dateKey: "2026-11-12" });
  });

  it("мусор → значения по умолчанию", () => {
    for (const date of ["2026-02-30", "2026-11-1", "завтра", "2026-11-09T00:00", "1999-01-01", "2100-01-01"]) {
      expect(parseScheduleParams({ date }, MON_EARLY).dateKey).toBe("2026-11-09");
    }
    expect(parseScheduleParams({ view: "month" }, MON_EARLY).view).toBe("day");
    expect(parseScheduleParams({ view: ["week", "day"], date: ["2026-11-12"] }, MON_EARLY))
      .toMatchObject({ view: "day", dateKey: "2026-11-09" });
  });

  it("подпись недели", () => {
    expect(weekLabel("2026-11-09")).toBe("9–14 ноября");
    expect(weekLabel("2026-11-30")).toBe("30 ноября – 5 декабря");
  });
});

describe("безопасные ссылки уведомлений (сервер)", () => {
  it("только свои относительные пути", () => {
    expect(isSafeHref("/dekanat/new?type=stip_increased")).toBe(true);
    expect(isSafeHref("//evil.com")).toBe(false);
    expect(isSafeHref("https://evil.com")).toBe(false);
    expect(isSafeHref(null)).toBe(false);
  });
});
