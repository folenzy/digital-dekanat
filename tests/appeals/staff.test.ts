import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { createAppeal } from "@/server/appeals/service";
import {
  getQueueAppeal, getStaffSummary, listQueue, listStaffDepartments, markReady, rejectAppeal, replyAppeal,
  requestInfo, takeAppeal,
} from "@/server/appeals/staff";
import { closeTestDb, testSql } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
// вторник 10 ноября 2026, 12:00 МСК
const NOW = new Date("2026-11-10T09:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);

let alina: StudentViewer;
let denis: StudentViewer;
let irina: StaffViewer;
let depts: Map<string, number>;

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

async function loadWorld() {
  await buildDemoWorld(db, NOW, pw);
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  denis = (await viewerOf("denis.kravtsov")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
  depts = new Map((await db.select().from(s.departments)).map((d) => [d.code, d.id]));
}

/** Новый сотрудник только в указанных отделах. */
async function makeStaff(codes: string[], firstName = "Вера"): Promise<StaffViewer> {
  const [u] = await db.insert(s.users).values({ role: "staff" }).returning();
  const [st] = await db.insert(s.staff).values({
    userId: u.id, lastName: "Тестова", firstName, middleName: "Павловна", position: "специалист",
  }).returning();
  if (codes.length > 0) {
    await db.insert(s.staffDepartments).values(codes.map((c) => ({ staffId: st.id, departmentId: depts.get(c)! })));
  }
  return (await viewerForUser(u.id)) as StaffViewer;
}

async function idOf(code: string) {
  const [r] = await db.select({ id: s.appeals.id }).from(s.appeals).where(eq(s.appeals.typeCode, code));
  return r.id;
}

async function appealRow(id: string) {
  const [r] = await db.select().from(s.appeals).where(eq(s.appeals.id, id));
  return r;
}

async function eventsOf(id: string) {
  return db.select().from(s.appealEvents).where(eq(s.appealEvents.appealId, id))
    .orderBy(asc(s.appealEvents.createdAt), asc(s.appealEvents.id));
}

async function notesFor(userId: string, href: string) {
  return db.select().from(s.notifications)
    .where(and(eq(s.notifications.userId, userId), eq(s.notifications.href, href)));
}

afterAll(closeTestDb);

describe("очередь сотрудника", () => {
  beforeAll(loadWorld);

  it("вкладки: новые, в работе, ждут студента, закрытые; сортировка по сроку", async () => {
    expect((await listQueue(irina, "new", undefined, NOW)).map((a) => a.type.code))
      .toEqual(["study_individual_plan", "stip_payment_question"]);
    expect((await listQueue(irina, "in_progress", undefined, NOW)).map((a) => a.type.code)).toEqual(["cert_military"]);
    expect((await listQueue(irina, "waiting", undefined, NOW)).map((a) => a.type.code)).toEqual(["study_retake"]);
    expect((await listQueue(irina, "closed", undefined, NOW)).map((a) => a.type.code)).toEqual(["cert_study"]);
  });

  it("элемент очереди: минимум о студенте, исполнитель, срок", async () => {
    const [item] = await listQueue(irina, "in_progress", undefined, NOW);
    expect(item).toEqual({
      id: await idOf("cert_military"), number: expect.stringMatching(/^О-2026-\d{6}$/),
      type: { code: "cert_military", title: "Справка для военкомата", topic: "certificates", kind: "certificate" },
      department: { id: depts.get("docs"), code: "docs", name: "Справки и документы" },
      status: "in_progress", slaDueAt: expect.any(Date), overdue: false,
      createdAt: expect.any(Date), updatedAt: expect.any(Date),
      assignee: "Ирина Николаевна Белова",
      student: { fullName: "Миронова Алина Сергеевна", group: "ПМИ-25-1" },
    });
    const [later] = await listQueue(irina, "in_progress", undefined, at(2 * DAY));
    expect(later.overdue).toBe(true);
  });

  it("фильтр по отделу; чужой отдел и неизвестная вкладка → пусто", async () => {
    expect((await listQueue(irina, "new", depts.get("stipend"), NOW)).map((a) => a.type.code))
      .toEqual(["stip_payment_question"]);
    expect(await listQueue(irina, "new", 9999, NOW)).toEqual([]);
    expect(await listQueue(irina, "bogus" as "new", undefined, NOW)).toEqual([]);
  });

  it("listStaffDepartments — только свои отделы", async () => {
    expect(await listStaffDepartments(irina)).toEqual([
      { id: depts.get("docs"), code: "docs", name: "Справки и документы" },
      { id: depts.get("study"), code: "study", name: "Учебный отдел" },
      { id: depts.get("stipend"), code: "stipend", name: "Стипендиальный отдел" },
    ]);
    const docsOnly = await makeStaff(["docs"]);
    expect((await listStaffDepartments(docsOnly)).map((d) => d.code)).toEqual(["docs"]);
  });

  it("карточка: о студенте только ФИО, факультет, группа, курс", async () => {
    const d = await getQueueAppeal(irina, await idOf("cert_military"), NOW);
    expect(d?.student).toEqual({
      fullName: "Миронова Алина Сергеевна", faculty: "Факультет прикладной математики и информатики",
      group: "ПМИ-25-1", course: 2,
    });
    expect(d).toMatchObject({ status: "in_progress", assignee: "Ирина Николаевна Белова" });
    const dump = JSON.stringify(d);
    for (const secret of ["ОР-25-0137", "alina.mironova", "Ковалёва", "бюджет", "очная", alina.userId]) {
      expect(dump).not.toContain(secret);
    }
    expect(await getQueueAppeal(irina, "not-a-uuid", NOW)).toBeNull();
    expect(await getQueueAppeal(irina, await idOf("study_retake"), NOW)).toMatchObject({
      disciplineName: "Статистика",
      student: { fullName: "Кравцов Денис Олегович", faculty: "Факультет экономики и управления", group: "ЭК-24-2", course: 3 },
    });
  });
});

describe("действия сотрудника", () => {
  beforeEach(loadWorld);

  it("takeAppeal: submitted → in_progress, исполнитель, первый ответ, событие, уведомление студенту", async () => {
    const r = await createAppeal(alina, "cert_social", { destination: "УСЗН района", copies: 1, format: "electronic" }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    const { id, number } = r.value;
    expect(await takeAppeal(irina, id, at(HOUR))).toEqual({ ok: true, value: { status: "in_progress" } });
    expect(await appealRow(id)).toMatchObject({
      status: "in_progress", assigneeStaffId: irina.staffId, firstResponseAt: at(HOUR), updatedAt: at(HOUR),
    });
    expect((await eventsOf(id)).map((e) => [e.kind, e.actorUserId])).toEqual([
      ["submitted", alina.userId], ["taken", irina.userId],
    ]);
    expect(await notesFor(alina.userId, `/dekanat/${id}`)).toMatchObject([
      { kind: "appeal_status", title: `Обращение ${number} принято в работу`, createdAt: at(HOUR) },
    ]);
    expect(await takeAppeal(irina, id, at(2 * HOUR))).toEqual({ ok: false, error: "bad_transition" });
    expect(await takeAppeal(irina, await idOf("study_retake"), NOW)).toEqual({ ok: false, error: "bad_transition" });
  });

  it("replyAppeal на submitted сначала берёт в работу; ответ — в переписке и в уведомлении", async () => {
    const id = await idOf("study_individual_plan");
    const [{ number }] = await db.select({ number: s.appeals.number }).from(s.appeals).where(eq(s.appeals.id, id));
    expect(await replyAppeal(irina, id, "Принеси справку с работы в каб. 214.", at(HOUR)))
      .toEqual({ ok: true, value: { status: "in_progress" } });
    expect(await appealRow(id)).toMatchObject({
      status: "in_progress", assigneeStaffId: irina.staffId, firstResponseAt: at(HOUR),
    });
    expect((await eventsOf(id)).map((e) => e.kind)).toEqual(["submitted", "taken", "replied"]);
    const messages = await db.select().from(s.appealMessages).where(eq(s.appealMessages.appealId, id));
    expect(messages).toMatchObject([{ authorUserId: irina.userId, body: "Принеси справку с работы в каб. 214." }]);
    const [student] = await testSql<{ user_id: string }[]>`
      select st.user_id from appeals a join students st on st.id = a.student_id where a.id = ${id}`;
    expect(await notesFor(student.user_id, `/dekanat/${id}`)).toMatchObject([
      { kind: "appeal_message", title: `Деканат ответил по обращению ${number}` },
    ]);
  });

  it("replyAppeal в needs_info и ready статус не меняет; в rejected/closed → closed; пустой текст → validation", async () => {
    const waiting = await idOf("study_retake");
    expect(await replyAppeal(irina, waiting, "Жду ответа", NOW)).toEqual({ ok: true, value: { status: "needs_info" } });
    const ready = await idOf("cert_study");
    expect(await replyAppeal(irina, ready, "Ждём тебя", NOW)).toEqual({ ok: true, value: { status: "ready" } });
    await db.update(s.appeals).set({ status: "closed" }).where(eq(s.appeals.id, ready));
    expect(await replyAppeal(irina, ready, "Ещё раз", NOW)).toEqual({ ok: false, error: "closed" });
    expect(await replyAppeal(irina, waiting, "  ", NOW)).toMatchObject({
      ok: false, error: "validation", fieldErrors: { text: "Заполни поле" },
    });
  });

  it("requestInfo только из in_progress: вопрос в переписке и в таймлайне, уведомление «Нужно уточнение…»", async () => {
    expect(await requestInfo(irina, await idOf("study_individual_plan"), "Какой период?", NOW))
      .toEqual({ ok: false, error: "bad_transition" });
    const id = await idOf("cert_military");
    const [{ number }] = await db.select({ number: s.appeals.number }).from(s.appeals).where(eq(s.appeals.id, id));
    expect(await requestInfo(irina, id, "Уточни номер военкомата", at(HOUR)))
      .toEqual({ ok: true, value: { status: "needs_info" } });
    expect((await appealRow(id)).status).toBe("needs_info");
    expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: "needs_info", text: "Уточни номер военкомата", actorUserId: irina.userId });
    expect(await db.select().from(s.appealMessages).where(eq(s.appealMessages.appealId, id)))
      .toMatchObject([{ body: "Уточни номер военкомата", authorUserId: irina.userId }]);
    expect(await notesFor(alina.userId, `/dekanat/${id}`)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "appeal_message", title: `Нужно уточнение по обращению ${number}` }),
    ]));
    expect(await requestInfo(irina, id, "Ещё вопрос", at(2 * HOUR))).toEqual({ ok: false, error: "bad_transition" });
  });

  it("markReady на submitted → bad_transition", async () => {
    const id = await idOf("study_individual_plan");
    expect(await markReady(irina, id, null, NOW)).toEqual({ ok: false, error: "bad_transition" });
    const r = await createAppeal(alina, "cert_study", { destination: "По месту требования", copies: 1, format: "paper" }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    expect(await markReady(irina, r.value.id, { place: "каб. 214", until: at(3 * DAY) }, NOW))
      .toEqual({ ok: false, error: "bad_transition" });
    expect((await appealRow(r.value.id)).status).toBe("submitted");
  });

  it("markReady для справки: место выдачи обязательно и срок в будущем", async () => {
    const id = await idOf("cert_military");
    const [{ number }] = await db.select({ number: s.appeals.number }).from(s.appeals).where(eq(s.appeals.id, id));
    for (const missing of [null, undefined as unknown as null]) {
      expect(await markReady(irina, id, missing, NOW)).toEqual({
        ok: false, error: "validation", fieldErrors: { place: "Укажи, где забрать справку" },
      });
    }
    expect(await markReady(irina, id, { place: "", until: at(DAY) }, NOW)).toMatchObject({
      ok: false, error: "validation", fieldErrors: { place: "Заполни поле" },
    });
    expect(await markReady(irina, id, { place: "каб. 214", until: at(-HOUR) }, NOW)).toMatchObject({
      ok: false, error: "validation", fieldErrors: { until: expect.any(String) },
    });
    expect(await markReady(irina, id, { place: "каб. 214", until: new Date("garbage") }, NOW)).toMatchObject({
      ok: false, error: "validation", fieldErrors: { until: "Укажи дату" },
    });
    expect((await appealRow(id)).status).toBe("in_progress");

    const until = new Date("2026-11-13T14:00:00Z");
    expect(await markReady(irina, id, { place: "каб. 214, корпус А", until }, at(HOUR)))
      .toEqual({ ok: true, value: { status: "ready" } });
    expect(await appealRow(id)).toMatchObject({ status: "ready", pickupPlace: "каб. 214, корпус А", pickupUntil: until });
    expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: "ready", text: "Справка готова. Забрать: каб. 214, корпус А до 13.11" });
    expect(await notesFor(alina.userId, `/dekanat/${id}`)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "appeal_status", title: `Справка по обращению ${number} готова`,
        body: "Забери справку: каб. 214, корпус А, до 13.11.",
      }),
    ]));
  });

  it("markReady не для справки: без места выдачи; место выдачи → validation", async () => {
    const id = await idOf("study_individual_plan");
    expect((await takeAppeal(irina, id, NOW)).ok).toBe(true);
    expect(await markReady(irina, id, { place: "каб. 214", until: at(DAY) }, NOW)).toMatchObject({
      ok: false, error: "validation", fieldErrors: { place: expect.any(String) },
    });
    expect(await markReady(irina, id, null, at(HOUR))).toEqual({ ok: true, value: { status: "ready" } });
    expect(await appealRow(id)).toMatchObject({ status: "ready", pickupPlace: null, pickupUntil: null });
  });

  it("rejectAppeal: причина 5–500, из submitted|in_progress; закрывает обращение", async () => {
    const id = await idOf("stip_payment_question");
    const [{ number }] = await db.select({ number: s.appeals.number }).from(s.appeals).where(eq(s.appeals.id, id));
    expect(await rejectAppeal(irina, id, "нет", NOW)).toEqual({
      ok: false, error: "validation", fieldErrors: { reason: "Минимум 5 символов" },
    });
    expect(await rejectAppeal(irina, id, "я".repeat(501), NOW)).toMatchObject({ ok: false, error: "validation" });
    expect(await rejectAppeal(irina, id, "Вопрос не к нам: выплаты ведёт бухгалтерия.", at(HOUR)))
      .toEqual({ ok: true, value: { status: "rejected" } });
    expect(await appealRow(id)).toMatchObject({
      status: "rejected", rejectReason: "Вопрос не к нам: выплаты ведёт бухгалтерия.", closedAt: at(HOUR),
      firstResponseAt: at(HOUR), assigneeStaffId: irina.staffId,
    });
    expect((await eventsOf(id)).at(-1)).toMatchObject({ kind: "rejected", text: "Вопрос не к нам: выплаты ведёт бухгалтерия." });
    const [student] = await testSql<{ user_id: string }[]>`
      select st.user_id from appeals a join students st on st.id = a.student_id where a.id = ${id}`;
    expect(await notesFor(student.user_id, `/dekanat/${id}`)).toMatchObject([
      { kind: "appeal_status", title: `Обращение ${number} отклонено` },
    ]);

    expect((await rejectAppeal(irina, await idOf("cert_military"), "Нет оснований для справки", NOW)).ok).toBe(true);
    expect(await rejectAppeal(irina, await idOf("study_retake"), "Нет оснований", NOW)).toEqual({ ok: false, error: "bad_transition" });
    expect(await rejectAppeal(irina, await idOf("cert_study"), "Нет оснований", NOW)).toEqual({ ok: false, error: "bad_transition" });
  });

  it("first_response_at ставится один раз; действовать может любой сотрудник отдела", async () => {
    const id = await idOf("cert_military");
    const before = await appealRow(id);
    const colleague = await makeStaff(["docs"], "Ольга");
    expect((await replyAppeal(colleague, id, "Справку подпишут завтра", at(HOUR))).ok).toBe(true);
    expect((await markReady(colleague, id, { place: "каб. 214", until: at(3 * DAY) }, at(2 * HOUR))).ok).toBe(true);
    expect(await appealRow(id)).toMatchObject({
      status: "ready", firstResponseAt: before.firstResponseAt, assigneeStaffId: irina.staffId,
    });
    const d = await getQueueAppeal(colleague, id, at(2 * HOUR));
    expect(d!.messages.map((m) => [m.author, m.authorName])).toEqual([["staff", "Ольга Павловна Тестова"]]);
  });

  it("два сотрудника одновременно берут одно обращение: успешно только один", async () => {
    const id = await idOf("stip_payment_question");
    const colleague = await makeStaff(["stipend"], "Ольга");
    const results = await Promise.all([takeAppeal(irina, id, NOW), takeAppeal(colleague, id, NOW)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "bad_transition" }]);
    expect((await eventsOf(id)).filter((e) => e.kind === "taken")).toHaveLength(1);
  });

  it("новое обращение уведомляет всех сотрудников своего отдела и только их", async () => {
    const docsColleague = await makeStaff(["docs"], "Ольга");
    const studyColleague = await makeStaff(["study"], "Нина");
    const r = await createAppeal(alina, "cert_study", { destination: "В банк", copies: 1, format: "paper" }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    const href = `/staff/appeals/${r.value.id}`;
    expect(await notesFor(irina.userId, href)).toHaveLength(1);
    expect(await notesFor(docsColleague.userId, href)).toHaveLength(1);
    expect(await notesFor(studyColleague.userId, href)).toHaveLength(0);
    expect(await notesFor(denis.userId, href)).toHaveLength(0);
  });

  it("лимит 30 сообщений в час действует и для сотрудника", async () => {
    const id = await idOf("cert_military");
    for (let i = 0; i < 30; i++) expect((await replyAppeal(irina, id, `Ответ ${i}`, at(i * 1000))).ok).toBe(true);
    expect(await replyAppeal(irina, id, "Ещё", at(31_000))).toEqual({ ok: false, error: "rate_limited" });
    expect(await requestInfo(irina, id, "Вопрос?", at(32_000))).toEqual({ ok: false, error: "rate_limited" });
    expect((await appealRow(id)).status).toBe("in_progress");
  });
});

describe("сводка сотрудника", () => {
  beforeAll(loadWorld);

  it("новых, в работе, просрочено, среднее время первого ответа за неделю", async () => {
    // первые ответы демо-мира: 20, 60 и 40 минут → 0,67 ч
    expect(await getStaffSummary(irina, NOW)).toEqual({ new: 2, inProgress: 1, overdue: 0, avgFirstResponseHoursWeek: 0.7 });
    // пятница 12:00 МСК: справка Алины (ср 18:00) и индивидуальный график (чт 18:00) просрочены
    expect(await getStaffSummary(irina, new Date("2026-11-13T09:00:00Z")))
      .toEqual({ new: 2, inProgress: 1, overdue: 2, avgFirstResponseHoursWeek: 0.7 });
    // через 8 дней первых ответов за неделю нет
    expect((await getStaffSummary(irina, at(8 * DAY))).avgFirstResponseHoursWeek).toBeNull();
  });

  it("только по своим отделам", async () => {
    // отдел docs: справка Алины (первый ответ через 20 мин) и справка Дениса (40 мин)
    const docsOnly = await makeStaff(["docs"]);
    expect(await getStaffSummary(docsOnly, NOW)).toEqual({ new: 0, inProgress: 1, overdue: 0, avgFirstResponseHoursWeek: 0.5 });
    const nobody = await makeStaff([]);
    expect(await getStaffSummary(nobody, NOW)).toEqual({ new: 0, inProgress: 0, overdue: 0, avgFirstResponseHoursWeek: null });
  });
});
