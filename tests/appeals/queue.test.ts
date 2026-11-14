import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer } from "@/server/auth/viewer";
import {
  countQueueTabs, listQueueGroups, QUEUE_GROUP_LIMIT, takeNextAppeal,
} from "@/server/appeals/staff";
import { closeTestDb, testSql } from "../helpers/db";

// Очередь сотрудника крупным планом: группы по сроку (границы — по московскому времени), предел строк
// в группе, счётчики вкладок одним запросом и «Взять следующее» — самое срочное новое обращение в своих отделах.

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
// вторник 10 ноября 2026, 12:00 МСК
const NOW = new Date("2026-11-10T09:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);
// границы дней по Москве (UTC+3): среда 00:00 МСК = вторник 21:00 UTC
const WED_00_MSK = new Date("2026-11-10T21:00:00Z");
const THU_00_MSK = new Date("2026-11-11T21:00:00Z");

let irina: StaffViewer;
let depts: Map<string, number>;

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

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

/** n новых обращений того же вида, что `code` из демо-мира, со сроком ответа slaDueAt. */
async function addSubmitted(code: string, slaDueAt: Date, n = 1): Promise<string[]> {
  const rows = await testSql<{ id: string }[]>`
    insert into appeals (student_id, type_code, department_id, status, fields, sla_due_at, created_at, updated_at)
    select a.student_id, a.type_code, a.department_id, 'submitted', a.fields,
           ${slaDueAt.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz
      from (select * from appeals where type_code = ${code} order by created_at limit 1) a,
           generate_series(1, ${n}) g
    returning id`;
  return rows.map((r) => r.id);
}

const keys = (groups: { key: string }[]) => groups.map((g) => g.key);
const codes = (items: { type: { code: string } }[]) => items.map((a) => a.type.code);

beforeEach(async () => {
  await buildDemoWorld(db, NOW, pw);
  irina = (await viewerOf("irina.belova")) as StaffViewer;
  depts = new Map((await db.select().from(s.departments)).map((d) => [d.code, d.id]));
});
afterAll(closeTestDb);

describe("listQueueGroups — группы по сроку", () => {
  it("демо-мир, «Новые»: просрочено и позже; пустые группы не возвращаются", async () => {
    const groups = await listQueueGroups(irina, "new", undefined, NOW);
    expect(keys(groups)).toEqual(["overdue", "later"]);
    expect(groups[0]).toMatchObject({ key: "overdue", total: 1 });
    expect(codes(groups[0].items)).toEqual(["study_other"]);
    expect(groups[1].total).toBe(2);
    expect(codes(groups[1].items)).toEqual(["study_individual_plan", "stip_payment_question"]);
  });

  it("границы групп — полночь по Москве, просрочено — строго раньше «сейчас»", async () => {
    const [overdue] = await addSubmitted("study_other", at(-MIN));
    const [onTime] = await addSubmitted("study_other", NOW);
    const [today] = await addSubmitted("study_other", new Date(WED_00_MSK.getTime() - MIN));
    const [tomorrowStart] = await addSubmitted("study_other", WED_00_MSK);
    const [tomorrowEnd] = await addSubmitted("study_other", new Date(THU_00_MSK.getTime() - MIN));
    const [later] = await addSubmitted("study_other", THU_00_MSK);

    const groups = await listQueueGroups(irina, "new", depts.get("study"), NOW);
    const where = new Map(groups.flatMap((g) => g.items.map((a) => [a.id, g.key] as const)));
    expect(where.get(overdue)).toBe("overdue");
    expect(where.get(onTime)).toBe("today");
    expect(where.get(today)).toBe("today");
    expect(where.get(tomorrowStart)).toBe("tomorrow");
    expect(where.get(tomorrowEnd)).toBe("tomorrow");
    expect(where.get(later)).toBe("later");
    expect(keys(groups)).toEqual(["overdue", "today", "tomorrow", "later"]);
  });

  it(`в группе не больше ${QUEUE_GROUP_LIMIT} строк, кроме «Сегодня»; total — сколько всего; внутри — по сроку`, async () => {
    await addSubmitted("study_other", at(-2 * HOUR), 25);
    await addSubmitted("study_other", at(2 * HOUR), 15);
    await addSubmitted("study_other", at(5 * DAY), 12);

    const groups = await listQueueGroups(irina, "new", undefined, NOW);
    const g = Object.fromEntries(groups.map((x) => [x.key, x]));
    expect(g.overdue.total).toBe(26);
    expect(g.overdue.items).toHaveLength(QUEUE_GROUP_LIMIT);
    expect(g.today.total).toBe(15);
    expect(g.today.items).toHaveLength(15); // горит сегодня — показываем всё
    expect(g.later.total).toBe(14);
    expect(g.later.items).toHaveLength(QUEUE_GROUP_LIMIT);
    for (const x of groups) {
      const times = x.items.map((a) => a.slaDueAt.getTime());
      expect(times).toEqual([...times].sort((p, q) => p - q));
    }
  });

  it("развёрнутая группа показывается целиком, остальные — по-прежнему с пределом", async () => {
    await addSubmitted("study_other", at(-2 * HOUR), 25);
    await addSubmitted("study_other", at(5 * DAY), 12);
    const groups = await listQueueGroups(irina, "new", undefined, NOW, "later");
    const g = Object.fromEntries(groups.map((x) => [x.key, x]));
    expect(g.later.items).toHaveLength(14);
    expect(g.overdue.items).toHaveLength(QUEUE_GROUP_LIMIT);
    // неизвестное значение «развернуть» не ломает очередь
    const bogus = await listQueueGroups(irina, "new", undefined, NOW, "everything" as "later");
    expect(bogus.find((x) => x.key === "overdue")!.items).toHaveLength(QUEUE_GROUP_LIMIT);
  });

  it("«Ждут студента» и «Закрытые» — одна группа без деления по сроку", async () => {
    const waiting = await listQueueGroups(irina, "waiting", undefined, NOW);
    expect(keys(waiting)).toEqual(["all"]);
    expect(codes(waiting[0].items)).toEqual(["study_retake"]);
    const closed = await listQueueGroups(irina, "closed", undefined, NOW);
    expect(keys(closed)).toEqual(["all"]);
    expect(codes(closed[0].items)).toEqual(["cert_study"]);
  });

  it("«Закрытые» — свежие сверху: срок ответа там уже не важен", async () => {
    const id = await idOf("study_other");
    await testSql`update appeals set status = 'rejected', reject_reason = 'Дубль обращения', updated_at = ${at(HOUR).toISOString()}::timestamptz
                  where id = ${id}`;
    const [closed] = await listQueueGroups(irina, "closed", undefined, at(2 * HOUR));
    expect(closed.items[0].id).toBe(id);
  });

  it("только свои отделы: фильтр, чужой отдел, неверная вкладка, сотрудник без отделов", async () => {
    const stipend = await listQueueGroups(irina, "new", depts.get("stipend"), NOW);
    expect(stipend.flatMap((g) => codes(g.items))).toEqual(["stip_payment_question"]);
    expect(await listQueueGroups(irina, "new", 9999, NOW)).toEqual([]);
    expect(await listQueueGroups(irina, "new", -1, NOW)).toEqual([]);
    expect(await listQueueGroups(irina, "bogus" as "new", undefined, NOW)).toEqual([]);
    const nobody = await makeStaff([]);
    expect(await listQueueGroups(nobody, "new", undefined, NOW)).toEqual([]);
  });
});

describe("countQueueTabs — счётчики вкладок одним запросом", () => {
  it("по своим отделам и с фильтром отдела", async () => {
    expect(await countQueueTabs(irina)).toEqual({ new: 3, in_progress: 1, waiting: 1, closed: 1 });
    expect(await countQueueTabs(irina, depts.get("stipend"))).toEqual({ new: 1, in_progress: 0, waiting: 0, closed: 0 });
    expect(await countQueueTabs(irina, 9999)).toEqual({ new: 0, in_progress: 0, waiting: 0, closed: 0 });
    const nobody = await makeStaff([]);
    expect(await countQueueTabs(nobody)).toEqual({ new: 0, in_progress: 0, waiting: 0, closed: 0 });
  });

  it("считает все обращения, а не только показанные строки", async () => {
    await addSubmitted("study_other", at(-2 * HOUR), 40);
    expect((await countQueueTabs(irina)).new).toBe(43);
  });
});

describe("takeNextAppeal — «Взять следующее»", () => {
  it("берёт самое срочное новое обращение в своих отделах: в работу, исполнитель — этот сотрудник", async () => {
    const res = await takeNextAppeal(irina, undefined, NOW);
    const expected = await idOf("study_other"); // просрочено — срочнее всех
    expect(res).toEqual({ ok: true, value: { status: "in_progress", id: expected } });
    const [row] = await db.select().from(s.appeals).where(eq(s.appeals.id, expected));
    expect(row).toMatchObject({ status: "in_progress", assigneeStaffId: irina.staffId, firstResponseAt: NOW });
    const taken = await db.select().from(s.appealEvents)
      .where(and(eq(s.appealEvents.appealId, expected), eq(s.appealEvents.kind, "taken")));
    expect(taken).toHaveLength(1);
  });

  it("с фильтром отдела — самое срочное в этом отделе", async () => {
    const res = await takeNextAppeal(irina, depts.get("stipend"), NOW);
    expect(res.ok && res.value.id).toBe(await idOf("stip_payment_question"));
  });

  it("берёт только новые: «в работе» и «ждут студента» не трогает", async () => {
    for (let i = 0; i < 3; i++) expect((await takeNextAppeal(irina, undefined, NOW)).ok).toBe(true);
    expect(await takeNextAppeal(irina, undefined, NOW)).toEqual({ ok: false, error: "empty" });
    expect(await countQueueTabs(irina)).toEqual({ new: 0, in_progress: 4, waiting: 1, closed: 1 });
  });

  it("нечего брать → empty: в отделе нет новых, чужой или неверный отдел, сотрудник без отделов", async () => {
    const docsOnly = await makeStaff(["docs"]);
    expect(await takeNextAppeal(docsOnly, undefined, NOW)).toEqual({ ok: false, error: "empty" });
    expect(await takeNextAppeal(irina, 9999, NOW)).toEqual({ ok: false, error: "empty" });
    expect(await takeNextAppeal(irina, -1, NOW)).toEqual({ ok: false, error: "empty" });
    const nobody = await makeStaff([]);
    expect(await takeNextAppeal(nobody, undefined, NOW)).toEqual({ ok: false, error: "empty" });
  });

  it("два сотрудника нажали одновременно — получают разные обращения", async () => {
    const colleague = await makeStaff(["study"], "Ольга");
    await addSubmitted("study_other", at(3 * HOUR), 2);
    const [a, b] = await Promise.all([
      takeNextAppeal(irina, depts.get("study"), NOW), takeNextAppeal(colleague, depts.get("study"), NOW),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.id).not.toBe(b.value.id);
  });

  it("последнее обращение двоим сразу: берёт один, второму — empty, событие одно", async () => {
    const colleague = await makeStaff(["stipend"], "Ольга");
    const id = await idOf("stip_payment_question");
    const results = await Promise.all([
      takeNextAppeal(irina, depts.get("stipend"), NOW), takeNextAppeal(colleague, depts.get("stipend"), NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "empty" }]);
    const taken = await db.select().from(s.appealEvents)
      .where(and(eq(s.appealEvents.appealId, id), eq(s.appealEvents.kind, "taken")));
    expect(taken).toHaveLength(1);
  });
});
