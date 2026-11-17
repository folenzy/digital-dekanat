import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StudentViewer } from "@/server/auth/viewer";
import { computeNudges, getNudges, type NudgeContext } from "@/server/nudges";
import { formatAverage, ruDate, ruDateKey, ruRelativeDate } from "@/server/format";
import { closeTestDb, testSql } from "./helpers/db";

const NOW = new Date("2026-11-10T09:00:00Z"); // вторник 12:00 МСК

const base: NudgeContext = {
  appeals: [], debts: [], risks: [], avgLastSession: null, lastSessionGrades: [], nextExamAt: null,
  stipendWindow: null, lessonsToday: [], lessonsTomorrow: [],
};
const WINDOW = { startsAt: new Date("2026-11-03T00:00:00+03:00"), endsAt: new Date("2026-11-20T23:59:00+03:00") };
const stipCtx = (over: Partial<NudgeContext> = {}): NudgeContext => ({
  ...base, avgLastSession: 4.8, lastSessionGrades: ["5", "5", "4", "зачёт"], stipendWindow: WINDOW, ...over,
});
const appeal = (over: Partial<NudgeContext["appeals"][number]>): NudgeContext["appeals"][number] => ({
  id: "a1", number: "О-2026-000001", typeCode: "stip_increased", typeTitle: "Повышенная стипендия",
  status: "submitted", pickup: null, ...over,
});
const lesson = (over: object) => ({
  pair: 2, start: "10:40", end: "12:10", discipline: "Базы данных", type: "lecture" as const,
  room: "А-101", building: null, teacher: "Иванов", cancelled: false, note: null, ...over,
});

describe("форматтер дат", () => {
  it("русские даты", () => {
    expect(ruDateKey("2026-11-20")).toBe("20 ноября");
    expect(ruDateKey("2026-03-05")).toBe("5 марта");
    expect(ruDate(new Date("2026-11-20T21:30:00Z"))).toBe("21 ноября"); // уже 21-е по Москве
    expect(ruRelativeDate(new Date("2026-11-10T21:30:00Z"), NOW)).toBe("завтра"); // 11-е, 00:30 МСК
    expect(ruRelativeDate(new Date("2026-11-10T09:30:00Z"), NOW)).toBe("сегодня");
    expect(ruRelativeDate(new Date("2026-11-13T09:00:00Z"), NOW)).toBe("13 ноября");
    expect(formatAverage(4.8)).toBe("4,8");
    expect(formatAverage(4.67)).toBe("4,67");
  });
});

describe("computeNudges: повышенная стипендия", () => {
  it("срабатывает; в тексте среднее с запятой и конец окна", () => {
    const [n, ...rest] = computeNudges(stipCtx(), NOW);
    expect(rest).toEqual([]);
    expect(n).toMatchObject({
      id: "stipend_increased", kind: "stipend_increased",
      action: { href: "/dekanat/new?type=stip_increased&prefill=1" },
    });
    expect(n.body).toContain("4,8");
    expect(n.body).toContain("до 20 ноября");
  });
  it("средний 4,5 — да, 4,49 — нет", () => {
    expect(computeNudges(stipCtx({ avgLastSession: 4.5 }), NOW)).toHaveLength(1);
    expect(computeNudges(stipCtx({ avgLastSession: 4.49 }), NOW)).toEqual([]);
    expect(computeNudges(stipCtx({ avgLastSession: null }), NOW)).toEqual([]);
  });
  it("тройка, двойка или незачёт в прошлой сессии — нет", () => {
    for (const bad of ["3", "2", "незачёт"]) {
      expect(computeNudges(stipCtx({ lastSessionGrades: ["5", "5", "5", bad] }), NOW)).toEqual([]);
    }
  });
  it("долг — нет", () => {
    const debt = { enrollmentId: 1, discipline: "Физика", semester: 1, grade: "2", retake: null };
    expect(computeNudges(stipCtx({ debts: [debt] }), NOW).map((n) => n.kind)).toEqual(["debt"]);
  });
  it("окно закрыто или не началось — нет", () => {
    expect(computeNudges(stipCtx(), new Date("2026-11-20T21:00:00Z"))).toEqual([]); // 21 ноября 00:00 МСК
    expect(computeNudges(stipCtx(), new Date("2026-11-02T09:00:00Z"))).toEqual([]);
    expect(computeNudges(stipCtx({ stipendWindow: null }), NOW)).toEqual([]);
  });
  it("заявление есть в любом статусе, кроме rejected, — нет", () => {
    for (const status of ["submitted", "in_progress", "needs_info", "ready", "closed"] as const) {
      const kinds = computeNudges(stipCtx({ appeals: [appeal({ status })] }), NOW).map((n) => n.kind);
      expect(kinds).not.toContain("stipend_increased");
    }
    expect(computeNudges(stipCtx({ appeals: [appeal({ status: "rejected" })] }), NOW).map((n) => n.kind))
      .toContain("stipend_increased");
    // заявление другого вида не мешает
    expect(computeNudges(stipCtx({ appeals: [appeal({ typeCode: "stip_social" })] }), NOW).map((n) => n.kind))
      .toContain("stipend_increased");
  });
});

describe("computeNudges: остальные правила", () => {
  it("needs_info → обращение", () => {
    const [n] = computeNudges({ ...base, appeals: [appeal({ id: "x1", typeCode: "study_retake", status: "needs_info" })] }, NOW);
    expect(n).toMatchObject({ id: "needs_info:x1", kind: "needs_info", action: { href: "/dekanat/x1" } });
    expect(n.title).toContain("О-2026-000001");
  });
  it("cert_ready с местом и сроком; без pickup — нет", () => {
    const ready = appeal({
      id: "c1", typeCode: "cert_study", status: "ready",
      pickup: { place: "каб. 214, корпус А", until: new Date("2026-11-13T17:00:00+03:00") },
    });
    const [n] = computeNudges({ ...base, appeals: [ready] }, NOW);
    expect(n).toMatchObject({ id: "cert_ready:c1", kind: "cert_ready", action: { href: "/dekanat/c1" } });
    expect(n.title).toBe("Справка готова, забери в каб. 214, корпус А до 13 ноября");
    expect(computeNudges({ ...base, appeals: [{ ...ready, pickup: null }] }, NOW)).toEqual([]);
  });
  it("debt: с пересдачей — дата, без — предложение; ссылка на сессию", () => {
    const retake = {
      id: 1, disciplineId: 1, discipline: "Статистика", kind: "retake" as const,
      startsAt: new Date("2026-11-17T10:00:00+03:00"), room: "А-218", building: null, individual: true, result: null,
    };
    const [a] = computeNudges({ ...base, debts: [{ enrollmentId: 5, discipline: "Статистика", semester: 4, grade: "2", retake }] }, NOW);
    expect(a).toMatchObject({ id: "debt:5", kind: "debt", action: { href: "/study?tab=session" } });
    expect(a.title).toContain("17 ноября");
    const [b] = computeNudges({ ...base, debts: [{ enrollmentId: 6, discipline: "Физика", semester: 4, grade: "незачёт", retake: null }] }, NOW);
    expect(b.title).toContain("Физика");
    expect(b.title).not.toContain("ноября");
  });
  it("admission_risk: срок ≤ 7 дней (или прошёл) и экзамен ≤ 45 дней", () => {
    const risk = {
      enrollmentId: 1, checkpointId: 9, discipline: "Эконометрика", title: "Лабораторная №3",
      dueDate: "2026-11-13", overdue: false, daysLeft: 3,
    };
    const exam = new Date("2026-12-20T09:00:00+03:00"); // 40 дней
    const [n] = computeNudges({ ...base, risks: [risk], nextExamAt: exam }, NOW);
    expect(n).toMatchObject({ id: "admission_risk:9", kind: "admission_risk", action: { href: "/study" } });
    expect(n.body).toContain("Эконометрика");
    expect(n.body).toContain("Лабораторная №3");
    expect(n.body).toContain("13 ноября");
    const overdue = { ...risk, overdue: true, daysLeft: -2, dueDate: "2026-11-08" };
    expect(computeNudges({ ...base, risks: [overdue], nextExamAt: exam }, NOW)).toHaveLength(1);
    expect(computeNudges({ ...base, risks: [risk], nextExamAt: new Date("2026-12-26T09:00:00+03:00") }, NOW)).toEqual([]); // 46 дней
    expect(computeNudges({ ...base, risks: [risk], nextExamAt: new Date("2026-12-25T10:00:00+03:00") }, NOW)).toHaveLength(1); // ровно 45
    expect(computeNudges({ ...base, risks: [risk], nextExamAt: null }, NOW)).toEqual([]);
    expect(computeNudges({ ...base, risks: [{ ...risk, daysLeft: 8 }], nextExamAt: exam }, NOW)).toEqual([]);
  });
  it("schedule_change: сегодня и завтра; без изменений — нет", () => {
    const changed = lesson({ change: { kind: "room", was: { room: "Б-202" } } });
    const cancelled = lesson({ pair: 3, cancelled: true, change: { kind: "cancelled" } });
    expect(computeNudges({ ...base, lessonsToday: [lesson({})], lessonsTomorrow: [] }, NOW)).toEqual([]);
    const list = computeNudges({ ...base, lessonsToday: [changed, cancelled], lessonsTomorrow: [changed] }, NOW);
    expect(list.map((n) => n.id)).toEqual(["schedule_change:2026-11-10", "schedule_change:2026-11-11"]);
    expect(list[0].title).toContain("сегодня");
    expect(list[1].title).toContain("завтра");
    expect(list[0].body).toContain("отменена");
    expect(list[0].action.href).toBe("/schedule");
  });
});

describe("computeNudges: приоритет и лимит", () => {
  it("больше трёх — три по порядку важности", () => {
    const changed = lesson({ change: { kind: "room", was: { room: "Б-202" } } });
    const list = computeNudges(stipCtx({
      appeals: [
        appeal({ id: "n1", typeCode: "study_retake", status: "needs_info" }),
        appeal({
          id: "c1", typeCode: "cert_study", status: "ready",
          pickup: { place: "каб. 214", until: new Date("2026-11-13T17:00:00+03:00") },
        }),
      ],
      debts: [{ enrollmentId: 5, discipline: "Физика", semester: 4, grade: "2", retake: null }],
      lessonsToday: [changed],
    }), NOW);
    expect(list.map((n) => n.kind)).toEqual(["needs_info", "cert_ready", "debt"]);
  });
  it("id стабильны между вызовами", () => {
    const ctx = stipCtx({ lessonsToday: [lesson({ change: { kind: "room" } })] });
    expect(computeNudges(ctx, NOW).map((n) => n.id)).toEqual(computeNudges(ctx, NOW).map((n) => n.id));
  });
});

describe("getNudges на демо-мире", () => {
  const db = drizzle(testSql, { schema: s });
  const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
  let alina: StudentViewer;
  let denis: StudentViewer;
  beforeAll(async () => {
    await buildDemoWorld(db, NOW, pw);
    const get = async (login: string) => {
      const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
      return (await viewerForUser(u.id)) as StudentViewer;
    };
    alina = await get("alina.mironova");
    denis = await get("denis.kravtsov");
  });
  afterAll(closeTestDb);

  it("Алина: повышенная стипендия со средним 4,8", async () => {
    const list = await getNudges(alina, NOW);
    expect(list.length).toBeLessThanOrEqual(3);
    const stip = list.find((n) => n.kind === "stipend_increased")!;
    expect(stip.body).toContain("4,8");
  });

  it("Денис: needs_info, cert_ready и debt; повышенной стипендии нет", async () => {
    const list = await getNudges(denis, NOW);
    expect(list.map((n) => n.kind)).toEqual(["needs_info", "cert_ready", "debt"]);
    expect(list[0].action.href).toMatch(/^\/dekanat\/[0-9a-f-]{36}$/);
    expect(list[1].title).toContain("каб. 214");
    expect(list[2].title).toContain("Статистика");
  });

  it("карточка исчезает, когда условие перестало выполняться", async () => {
    await testSql`insert into appeals (student_id, type_code, department_id, status, sla_due_at)
      select ${alina.studentId}, 'stip_increased', department_id, 'submitted', now() + interval '3 days'
      from appeals limit 1`;
    expect((await getNudges(alina, NOW)).map((n) => n.kind)).not.toContain("stipend_increased");
  });
});
