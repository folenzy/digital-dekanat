import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import {
  confirmReceived, createAppeal, getMyAppeal, listMyAppeals, postStudentMessage,
} from "@/server/appeals/service";
import { slaDueForType } from "@/server/appeals/sla";
import { requestInfo, takeAppeal } from "@/server/appeals/staff";
import { addWorkingDays } from "@/server/time";
import { closeTestDb, testSql } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
// вторник 10 ноября 2026, 12:00 МСК
const NOW = new Date("2026-11-10T09:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const SEC = 1000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let alina: StudentViewer;
let denis: StudentViewer;
let irina: StaffViewer;

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

async function appealRow(id: string) {
  const [r] = await db.select().from(s.appeals).where(eq(s.appeals.id, id));
  return r;
}

async function appealIdOf(v: StudentViewer, code: string) {
  const [r] = await db.select({ id: s.appeals.id }).from(s.appeals)
    .where(and(eq(s.appeals.studentId, v.studentId), eq(s.appeals.typeCode, code)));
  return r.id;
}

async function countOf(table: typeof s.appeals | typeof s.appealMessages | typeof s.actionLog) {
  const [r] = await db.select({ n: count() }).from(table);
  return r.n;
}

async function disciplineId(name: string) {
  const [d] = await db.select().from(s.disciplines).where(eq(s.disciplines.name, name));
  return d.id;
}

const cert = (destination = "Военный комиссариат Ленинского района") =>
  ({ destination, copies: 2, format: "paper" as const });

beforeEach(async () => {
  await buildDemoWorld(db, NOW, pw);
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  denis = (await viewerOf("denis.kravtsov")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
});
afterAll(closeTestDb);

describe("createAppeal: маршрутизация и срок ответа", () => {
  it("cert_military уходит в отдел docs, sla_due_at = addWorkingDays(now, 1), событие и уведомление сотрудникам", async () => {
    const r = await createAppeal(alina, "cert_military", cert(), NOW);
    expect(r).toEqual({ ok: true, value: { id: expect.any(String), number: "О-2026-000007" } });
    if (!r.ok) return;

    const row = await appealRow(r.value.id);
    const [docs] = await db.select().from(s.departments).where(eq(s.departments.code, "docs"));
    expect(row).toMatchObject({
      studentId: alina.studentId, typeCode: "cert_military", departmentId: docs.id, status: "submitted",
      assigneeStaffId: null, firstResponseAt: null, createdAt: NOW, updatedAt: NOW,
      fields: { destination: "Военный комиссариат Ленинского района", copies: 2, format: "paper" },
    });
    expect(row.slaDueAt).toEqual(addWorkingDays(NOW, 1));
    expect(row.slaDueAt.toISOString()).toBe("2026-11-11T15:00:00.000Z"); // среда, 18:00 МСК
    expect(slaDueForType("cert_military", NOW)).toEqual(row.slaDueAt); // то же обещание видно до отправки
    const [t] = await testSql<{ t: string }[]>`select jsonb_typeof(fields) as t from appeals where id = ${r.value.id}`;
    expect(t.t).toBe("object");

    const events = await db.select().from(s.appealEvents).where(eq(s.appealEvents.appealId, r.value.id));
    expect(events).toMatchObject([{ kind: "submitted", actorUserId: alina.userId, createdAt: NOW }]);

    const notes = await db.select().from(s.notifications)
      .where(and(eq(s.notifications.userId, irina.userId), eq(s.notifications.href, `/staff/appeals/${r.value.id}`)));
    expect(notes).toMatchObject([{ kind: "appeal_new", title: "Новое обращение О-2026-000007", createdAt: NOW }]);
  });

  it("учебный вопрос — в учебный отдел за 2 рабочих дня, стипендия — в стипендиальный за 3", async () => {
    const study = await createAppeal(alina, "study_other", { text: "Можно ли сдать курсовую раньше срока?" }, NOW);
    const stip = await createAppeal(alina, "stip_social", { text: "Хочу оформить социальную стипендию, что нужно?" }, NOW);
    if (!study.ok || !stip.ok) throw new Error("ожидался успех");
    const deps = new Map((await db.select().from(s.departments)).map((d) => [d.code, d.id]));
    expect(await appealRow(study.value.id)).toMatchObject({
      departmentId: deps.get("study"), slaDueAt: addWorkingDays(NOW, 2),
    });
    expect(await appealRow(stip.value.id)).toMatchObject({
      departmentId: deps.get("stipend"), slaDueAt: addWorkingDays(NOW, 3),
    });
  });
});

describe("createAppeal: валидация", () => {
  it("неизвестный тип и ключи прототипа → validation, ничего не создано", async () => {
    const before = await countOf(s.appeals);
    for (const code of ["cert_unknown", "constructor", "__proto__", "toString", ""]) {
      expect(await createAppeal(alina, code, cert(), NOW)).toMatchObject({ ok: false, error: "validation" });
    }
    expect(await countOf(s.appeals)).toBe(before);
  });

  it("ошибки полей — по-русски, по ключу поля", async () => {
    const r = await createAppeal(alina, "cert_study", { copies: 6, format: "fax" }, NOW);
    expect(r).toEqual({
      ok: false, error: "validation",
      fieldErrors: { destination: "Заполни поле", copies: "Не больше 5", format: "Выбери один из вариантов" },
    });
    expect(await createAppeal(alina, "study_other", { text: "коротко" }, NOW)).toEqual({
      ok: false, error: "validation", fieldErrors: { text: "Минимум 10 символов" },
    });
    expect(await createAppeal(alina, "stip_social", { text: "я".repeat(2001) }, NOW)).toEqual({
      ok: false, error: "validation", fieldErrors: { text: "Не больше 2000 символов" },
    });
    expect(await createAppeal(alina, "cert_study", { ...cert(), copies: "2" }, NOW)).toMatchObject({
      ok: false, error: "validation", fieldErrors: { copies: "Укажи число" },
    });
    for (const bad of [null, "строка", 42, []]) {
      expect(await createAppeal(alina, "cert_study", bad, NOW)).toMatchObject({ ok: false, error: "validation" });
    }
  });

  it("disciplineId — только из дисциплин самого студента", async () => {
    const statistics = await disciplineId("Статистика"); // есть только у Дениса
    expect(await createAppeal(alina, "study_retake", { text: "Хочу пересдать этот предмет", disciplineId: statistics }, NOW))
      .toEqual({ ok: false, error: "validation", fieldErrors: { disciplineId: "Выбери дисциплину из своего списка" } });

    const calculus = await disciplineId("Математический анализ");
    const r = await createAppeal(alina, "study_retake", { text: "Хочу пересдать этот предмет", disciplineId: calculus }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    expect((await appealRow(r.value.id)).fields).toEqual({ text: "Хочу пересдать этот предмет", disciplineId: calculus });
  });
});

describe("createAppeal: двойная отправка", () => {
  it("тот же студент, тип и поля в течение 10 с → тот же id, одна строка, лимит не тратится", async () => {
    const before = await countOf(s.appeals);
    const first = await createAppeal(alina, "cert_military", cert(), NOW);
    // те же поля в другом порядке ключей — JSON-равны
    const again = await createAppeal(alina, "cert_military", { format: "paper", copies: 2, destination: "Военный комиссариат Ленинского района" }, at(9 * SEC));
    expect(first.ok && again.ok).toBe(true);
    expect(again).toEqual(first);
    expect(await countOf(s.appeals)).toBe(before + 1);
    expect(await countOf(s.actionLog)).toBe(1);

    const later = await createAppeal(alina, "cert_military", cert(), at(11 * SEC));
    expect(later.ok && first.ok && later.value.id !== first.value.id).toBe(true);
    const other = await createAppeal(alina, "cert_military", cert("Другой военкомат"), at(12 * SEC));
    expect(other.ok && later.ok && other.value.id !== later.value.id).toBe(true);
  });

  it("два одновременных запроса (двойной тап) → один id и одна строка", async () => {
    const before = await countOf(s.appeals);
    const [a, b] = await Promise.all([
      createAppeal(alina, "cert_study", cert("По месту требования"), NOW),
      createAppeal(alina, "cert_study", cert("По месту требования"), NOW),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(a).toEqual(b);
    expect(await countOf(s.appeals)).toBe(before + 1);
    expect(await countOf(s.actionLog)).toBe(1);
  });
});

describe("createAppeal: лимит 10 в час", () => {
  it("11-е обращение за час → rate_limited, ничего не создано; через час снова можно", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await createAppeal(alina, "cert_study", cert(`Место №${i}`), at(i * 60 * SEC))).ok).toBe(true);
    }
    const before = await countOf(s.appeals);
    expect(await createAppeal(alina, "cert_study", cert("Место №11"), at(30 * 60 * SEC)))
      .toEqual({ ok: false, error: "rate_limited" });
    expect(await countOf(s.appeals)).toBe(before);
    // Денис не затронут
    expect((await createAppeal(denis, "cert_study", cert("Место №11"), at(30 * 60 * SEC))).ok).toBe(true);
    // первое вышло из окна
    expect((await createAppeal(alina, "cert_study", cert("Место №12"), at(HOUR + SEC))).ok).toBe(true);
  });

  it("повторы двойной отправки не расходуют лимит", async () => {
    expect((await createAppeal(alina, "cert_study", cert("Повтор"), NOW)).ok).toBe(true);
    for (let i = 0; i < 12; i++) expect((await createAppeal(alina, "cert_study", cert("Повтор"), NOW)).ok).toBe(true);
    for (let i = 1; i < 10; i++) expect((await createAppeal(alina, "cert_study", cert(`Новое ${i}`), at(i * SEC))).ok).toBe(true);
    expect(await createAppeal(alina, "cert_study", cert("Лишнее"), at(20 * SEC))).toEqual({ ok: false, error: "rate_limited" });
  });

  it("15 одновременных разных обращений: не больше 10 создано, лимит не превышен", async () => {
    const before = await countOf(s.appeals);
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => createAppeal(alina, "cert_study", cert(`Параллельно ${i}`), NOW)),
    );
    const created = results.filter((r) => r.ok).length;
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThanOrEqual(10);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === "rate_limited")).toBe(true);
    expect(await countOf(s.appeals)).toBe(before + created);
    expect(await countOf(s.actionLog)).toBe(created);
  });
});

describe("текст хранится дословно", () => {
  const nasty = `<script>alert(1)</script> «кавычки» & <b>жирный</b> 👋🏽🎓 ' or 1=1 --`;

  it("HTML и эмодзи в fields.text и в сообщении возвращаются без изменений", async () => {
    const r = await createAppeal(alina, "study_other", { text: nasty }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    const [raw] = await testSql<{ text: string }[]>`select fields->>'text' as text from appeals where id = ${r.value.id}`;
    expect(raw.text).toBe(nasty);

    expect((await postStudentMessage(alina, r.value.id, nasty, at(SEC))).ok).toBe(true);
    const detail = await getMyAppeal(alina, r.value.id, at(SEC));
    expect(detail?.fields.text).toBe(nasty);
    expect(detail?.messages.map((m) => m.body)).toEqual([nasty]);
  });
});

describe("мои обращения", () => {
  it("активные и завершённые, только свои, свежие изменения сверху", async () => {
    const active = await listMyAppeals(denis, "active", NOW);
    expect(active.map((a) => a.type.code)).toEqual(["cert_study", "study_retake"]);
    expect(active[0]).toEqual({
      id: await appealIdOf(denis, "cert_study"), number: expect.stringMatching(/^О-2026-\d{6}$/),
      type: { code: "cert_study", title: "Справка об обучении", topic: "certificates", kind: "certificate" },
      department: { id: expect.any(Number), code: "docs", name: "Справки и документы" },
      status: "ready", slaDueAt: expect.any(Date), overdue: false,
      createdAt: expect.any(Date), updatedAt: expect.any(Date),
    });
    expect(await listMyAppeals(denis, "done", NOW)).toEqual([]);
    expect((await listMyAppeals(alina, "active", NOW)).map((a) => a.type.code)).toEqual(["cert_military"]);

    await confirmReceived(denis, active[0].id, NOW);
    expect((await listMyAppeals(denis, "done", NOW)).map((a) => a.id)).toEqual([active[0].id]);
    expect((await listMyAppeals(denis, "active", NOW)).map((a) => a.type.code)).toEqual(["study_retake"]);
  });
});

describe("карточка обращения", () => {
  it("таймлайн, переписка, отдел, исполнитель", async () => {
    const id = await appealIdOf(denis, "study_retake");
    const d = await getMyAppeal(denis, id, NOW);
    expect(d).toMatchObject({
      id, number: expect.stringMatching(/^О-2026-\d{6}$/),
      type: { code: "study_retake", title: "Пересдача", topic: "study", kind: "application" },
      department: { code: "study", name: "Учебный отдел" },
      status: "needs_info", overdue: false, pickup: null, rejectReason: null,
      assignee: "Ирина Николаевна Белова",
      fields: { text: expect.stringContaining("статистику"), disciplineId: await disciplineId("Статистика") },
      disciplineName: "Статистика",
    });
    expect((await getMyAppeal(denis, await appealIdOf(denis, "cert_study"), NOW))?.disciplineName).toBeNull();
    expect(d!.events.map((e) => [e.kind, e.actor, e.actorName])).toEqual([
      ["submitted", "student", "Кравцов Денис Олегович"],
      ["taken", "staff", "Ирина Николаевна Белова"],
      ["needs_info", "staff", "Ирина Николаевна Белова"],
    ]);
    expect(d!.events[2].text).toContain("Пересдача по статистике");
    expect(d!.messages).toEqual([{
      id: expect.any(Number), body: expect.stringContaining("Пересдача по статистике"), at: expect.any(Date),
      author: "staff", authorName: "Ирина Николаевна Белова",
    }]);
  });

  it("готовая справка: где и до какого числа забрать", async () => {
    const d = await getMyAppeal(denis, await appealIdOf(denis, "cert_study"), NOW);
    expect(d?.pickup).toEqual({ place: "каб. 214, корпус А", until: expect.any(Date) });
  });

  it("просрочка видна студенту, а пока ждут ответа студента — срок не горит", async () => {
    const mine = await appealIdOf(alina, "cert_military");
    expect((await getMyAppeal(alina, mine, NOW))?.overdue).toBe(false);
    expect((await getMyAppeal(alina, mine, at(2 * DAY)))?.overdue).toBe(true);
    const waiting = await appealIdOf(denis, "study_retake");
    expect((await getMyAppeal(denis, waiting, at(30 * DAY)))?.overdue).toBe(false);
  });

  it("кривой или несуществующий id → null, без ошибки БД", async () => {
    for (const bad of ["abc", "", "1' or '1'='1", "00000000-0000-0000-0000-00000000000g", 123, null]) {
      expect(await getMyAppeal(alina, bad as string, NOW)).toBeNull();
    }
    expect(await getMyAppeal(alina, "6f1c1b7e-2f7a-4c55-9a51-0c2b7f0e1a11", NOW)).toBeNull();
  });
});

describe("переписка и уточнение", () => {
  it("requestInfo → студент отвечает → in_progress и новый срок от момента ответа", async () => {
    const r = await createAppeal(alina, "study_other", { text: "Как перевестись на другой профиль?" }, NOW);
    if (!r.ok) throw new Error("ожидался успех");
    expect((await takeAppeal(irina, r.value.id, at(HOUR))).ok).toBe(true);
    expect((await requestInfo(irina, r.value.id, "На какой профиль хочешь перейти?", at(2 * HOUR))).ok).toBe(true);
    expect((await appealRow(r.value.id)).status).toBe("needs_info");

    const answerAt = new Date("2026-11-13T10:00:00Z"); // пятница
    expect(await postStudentMessage(alina, r.value.id, "На анализ данных.", answerAt))
      .toEqual({ ok: true, value: { status: "in_progress" } });
    const row = await appealRow(r.value.id);
    expect(row.status).toBe("in_progress");
    expect(row.slaDueAt).toEqual(addWorkingDays(answerAt, 2));
    expect(row.slaDueAt.toISOString()).toBe("2026-11-17T15:00:00.000Z"); // вторник, 18:00 МСК
    expect(row.updatedAt).toEqual(answerAt);

    const d = await getMyAppeal(alina, r.value.id, answerAt);
    expect(d!.events.map((e) => e.kind)).toEqual(["submitted", "taken", "needs_info", "answered"]);
    expect(d!.events[3]).toMatchObject({ actor: "student", actorName: "Миронова Алина Сергеевна", at: answerAt });
    expect(d!.messages.map((m) => [m.author, m.body])).toEqual([
      ["staff", "На какой профиль хочешь перейти?"], ["student", "На анализ данных."],
    ]);
    const notes = await db.select().from(s.notifications)
      .where(and(eq(s.notifications.userId, irina.userId), eq(s.notifications.kind, "appeal_message")));
    expect(notes).toMatchObject([{ href: `/staff/appeals/${r.value.id}`, createdAt: answerAt }]);
  });

  it("сообщение в submitted/in_progress/ready не меняет статус и срок", async () => {
    expect((await createAppeal(alina, "cert_grades", cert("В магистратуру"), NOW)).ok).toBe(true);
    for (const [v, code] of [[alina, "cert_grades"], [alina, "cert_military"], [denis, "cert_study"]] as const) {
      const id = await appealIdOf(v, code);
      const before = await appealRow(id);
      const r = await postStudentMessage(v, id, "Спасибо!", at(HOUR));
      expect(r).toEqual({ ok: true, value: { status: before.status } });
      const after = await appealRow(id);
      expect(after.slaDueAt).toEqual(before.slaDueAt);
      expect(after.updatedAt).toEqual(at(HOUR));
    }
  });

  it("в закрытое или отклонённое обращение писать нельзя → closed", async () => {
    const id = await appealIdOf(denis, "cert_study");
    expect((await confirmReceived(denis, id, NOW)).ok).toBe(true);
    const before = await countOf(s.appealMessages);
    expect(await postStudentMessage(denis, id, "Ещё вопрос", at(SEC))).toEqual({ ok: false, error: "closed" });
    await db.update(s.appeals).set({ status: "rejected" }).where(eq(s.appeals.id, await appealIdOf(denis, "study_retake")));
    expect(await postStudentMessage(denis, await appealIdOf(denis, "study_retake"), "А почему?", at(SEC)))
      .toEqual({ ok: false, error: "closed" });
    expect(await postStudentMessage(denis, await appealIdOf(alina, "cert_military"), "Чужое", at(SEC)))
      .toEqual({ ok: false, error: "not_found" });
    expect(await countOf(s.appealMessages)).toBe(before);
    // неудачные попытки не расходуют лимит сообщений
    expect(await countOf(s.actionLog)).toBe(0);
  });

  it("пустое, слишком длинное или не строка → validation, ничего не создано", async () => {
    const id = await appealIdOf(alina, "cert_military");
    const before = await countOf(s.appealMessages);
    for (const bad of ["", "   ", "я".repeat(2001), 42, null]) {
      expect(await postStudentMessage(alina, id, bad as string, NOW)).toMatchObject({
        ok: false, error: "validation", fieldErrors: { text: expect.any(String) },
      });
    }
    expect(await countOf(s.appealMessages)).toBe(before);
  });

  it("лимит 30 сообщений в час на пользователя", async () => {
    const id = await appealIdOf(alina, "cert_military");
    for (let i = 0; i < 30; i++) expect((await postStudentMessage(alina, id, `Сообщение ${i}`, at(i * SEC))).ok).toBe(true);
    expect(await postStudentMessage(alina, id, "Тридцать первое", at(31 * SEC))).toEqual({ ok: false, error: "rate_limited" });
    expect(await db.select({ n: count() }).from(s.appealMessages).where(eq(s.appealMessages.appealId, id)))
      .toEqual([{ n: 30 }]);
    expect((await postStudentMessage(alina, id, "Через час", at(HOUR + SEC))).ok).toBe(true);
  });
});

describe("confirmReceived", () => {
  it("ready → closed, событие и время закрытия; повтор → bad_transition", async () => {
    const id = await appealIdOf(denis, "cert_study");
    expect(await confirmReceived(denis, id, NOW)).toEqual({ ok: true, value: { status: "closed" } });
    expect(await appealRow(id)).toMatchObject({ status: "closed", closedAt: NOW, updatedAt: NOW });
    const events = await db.select().from(s.appealEvents).where(eq(s.appealEvents.appealId, id))
      .orderBy(asc(s.appealEvents.createdAt), asc(s.appealEvents.id));
    expect(events.at(-1)).toMatchObject({ kind: "closed", actorUserId: denis.userId, createdAt: NOW });
    expect(await confirmReceived(denis, id, at(SEC))).toEqual({ ok: false, error: "bad_transition" });
  });

  it("не из ready → bad_transition, статус не меняется", async () => {
    const id = await appealIdOf(denis, "study_retake");
    expect(await confirmReceived(denis, id, NOW)).toEqual({ ok: false, error: "bad_transition" });
    expect((await appealRow(id)).status).toBe("needs_info");
  });
});
