import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { getProfile } from "@/server/profile";
import { getDay, getTodayOverview, getWeek } from "@/server/schedule";
import { getStudySummary } from "@/server/grades";
import { listAnnouncementsFor } from "@/server/announcements";
import { listUpcomingDeadlines } from "@/server/deadlines";
import { listNotifications, markAllRead, markRead, unreadCount } from "@/server/notifications";
import { confirmReceived, getMyAppeal, listMyAppeals, postStudentMessage } from "@/server/appeals/service";
import {
  getQueueAppeal, getStaffSummary, listQueue, markReady, rejectAppeal, replyAppeal, requestInfo, takeAppeal,
} from "@/server/appeals/staff";
import { closeTestDb, testSql } from "./helpers/db";

// Общий файл проверок «студент не видит чужого»; следующие задачи добавляют свои блоки.
const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const now = new Date("2026-11-10T09:00:00Z");

let alina: StudentViewer;
let denis: StudentViewer;

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id)) as StudentViewer;
}

beforeAll(async () => {
  await buildDemoWorld(db, now, pw);
  alina = await viewerOf("alina.mironova");
  denis = await viewerOf("denis.kravtsov");
});
afterAll(closeTestDb);

describe("IDOR: уведомления", () => {
  it("markRead чужого уведомления: false, read_at не меняется", async () => {
    const theirs = await testSql<{ id: number }[]>`
      select id from notifications where user_id = ${denis.userId} and read_at is null`;
    expect(theirs.length).toBeGreaterThan(0);
    for (const n of theirs) expect(await markRead(alina, n.id)).toBe(false);
    const after = await testSql<{ read_at: Date | null }[]>`
      select read_at from notifications where user_id = ${denis.userId} and read_at is null`;
    expect(after).toHaveLength(theirs.length);
  });

  it("listNotifications(алина) не содержит уведомлений Дениса", async () => {
    const denisIds = new Set(
      (await testSql<{ id: number }[]>`select id from notifications where user_id = ${denis.userId}`).map((r) => r.id),
    );
    const mine = await listNotifications(alina, {});
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((n) => denisIds.has(n.id))).toBe(false);
    expect((await listNotifications(alina, { unreadOnly: true })).some((n) => denisIds.has(n.id))).toBe(false);
  });

  it("markAllRead(алина) не трогает уведомления Дениса и счётчик Дениса", async () => {
    const before = await unreadCount(denis);
    expect(before).toBeGreaterThan(0);
    await markAllRead(alina);
    expect(await unreadCount(denis)).toBe(before);
    expect(await unreadCount(alina)).toBe(0);
  });
});

describe("IDOR: данные студента берутся из Viewer", () => {
  it("профиль, успеваемость, дедлайны, расписание и объявления Алины не содержат данных Дениса", async () => {
    const dump = JSON.stringify([
      await getProfile(alina), await getStudySummary(alina, now), await listUpcomingDeadlines(alina, now),
      await getDay(alina, now), await getWeek(alina, now), await getTodayOverview(alina, now),
      await listAnnouncementsFor(alina),
    ]);
    for (const secret of ["Кравцов", "ЭК-24", "ОР-24-0412", "Статистика", "Эконометрика", "denis.kravtsov"]) {
      expect(dump).not.toContain(secret);
    }
  });

  it("и наоборот: у Дениса нет данных Алины", async () => {
    const dump = JSON.stringify([
      await getProfile(denis), await getStudySummary(denis, now), await listUpcomingDeadlines(denis, now),
      await getDay(denis, now), await listAnnouncementsFor(denis),
    ]);
    for (const secret of ["Миронова", "ПМИ-25", "ОР-25-0137", "Математический анализ", "Консультация по математическому анализу"]) {
      expect(dump).not.toContain(secret);
    }
  });
});

describe("IDOR: обращения", () => {
  type Snapshot = { appeals: unknown[]; events: number; messages: number; notifications: number };
  async function snapshot(): Promise<Snapshot> {
    const [counts] = await testSql<{ events: number; messages: number; notifications: number }[]>`
      select (select count(*)::int from appeal_events) as events,
             (select count(*)::int from appeal_messages) as messages,
             (select count(*)::int from notifications) as notifications`;
    const appeals = await testSql`
      select id, status, assignee_staff_id, sla_due_at::text, updated_at::text, pickup_place, reject_reason
      from appeals order by id`;
    return { appeals: [...appeals], ...counts };
  }

  async function appealsOf(v: StudentViewer) {
    return (await testSql<{ id: string; type_code: string; status: string }[]>`
      select id, type_code, status from appeals where student_id = ${v.studentId}`);
  }

  async function makeStaff(departmentCodes: string[]): Promise<StaffViewer> {
    const [u] = await testSql<{ id: string }[]>`insert into users (role) values ('staff') returning id`;
    const [st] = await testSql<{ id: number }[]>`
      insert into staff (user_id, last_name, first_name, middle_name, position)
      values (${u.id}, 'Проверкина', 'Зоя', 'Ильинична', 'специалист') returning id`;
    await testSql`
      insert into staff_departments (staff_id, department_id)
      select ${st.id}, id from departments where code = any(${departmentCodes})`;
    return (await viewerForUser(u.id)) as StaffViewer;
  }

  it("getMyAppeal(алина, id обращения Дениса) === null", async () => {
    const theirs = await appealsOf(denis);
    expect(theirs.length).toBeGreaterThan(0);
    for (const a of theirs) expect(await getMyAppeal(alina, a.id, now)).toBeNull();
    // контроль: своё Денис видит
    for (const a of theirs) expect(await getMyAppeal(denis, a.id, now)).not.toBeNull();
  });

  it("listMyAppeals(алина) не содержит обращений Дениса", async () => {
    const theirs = new Set((await appealsOf(denis)).map((a) => a.id));
    const mine = [...await listMyAppeals(alina, "active", now), ...await listMyAppeals(alina, "done", now)];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((a) => theirs.has(a.id))).toBe(false);
  });

  it("postStudentMessage(алина, id Дениса) → not_found, сообщение не создано", async () => {
    const before = await snapshot();
    for (const a of await appealsOf(denis)) {
      expect(await postStudentMessage(alina, a.id, "Чужое обращение", now)).toEqual({ ok: false, error: "not_found" });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("confirmReceived(алина, id готовой справки Дениса) → not_found, статус не изменился", async () => {
    const ready = (await appealsOf(denis)).find((a) => a.status === "ready")!;
    expect(ready).toBeDefined();
    const before = await snapshot();
    expect(await confirmReceived(alina, ready.id, now)).toEqual({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
  });

  it("сотрудник только отдела docs не видит и не трогает обращение учебного отдела", async () => {
    const docsOnly = await makeStaff(["docs"]);
    const study = (await appealsOf(denis)).find((a) => a.type_code === "study_retake")!;
    for (const tab of ["new", "in_progress", "waiting", "closed"] as const) {
      const queue = await listQueue(docsOnly, tab, undefined, now);
      expect(queue.some((a) => a.id === study.id)).toBe(false);
      expect(queue.every((a) => a.department.code === "docs")).toBe(true);
    }
    const [studyDept] = await testSql<{ id: number }[]>`select id from departments where code = 'study'`;
    expect(await listQueue(docsOnly, "waiting", studyDept.id, now)).toEqual([]);
    expect(await getQueueAppeal(docsOnly, study.id, now)).toBeNull();

    const before = await snapshot();
    expect(await takeAppeal(docsOnly, study.id, now)).toEqual({ ok: false, error: "not_found" });
    expect(await replyAppeal(docsOnly, study.id, "Ответ", now)).toEqual({ ok: false, error: "not_found" });
    expect(await requestInfo(docsOnly, study.id, "Вопрос", now)).toEqual({ ok: false, error: "not_found" });
    expect(await markReady(docsOnly, study.id, null, now)).toEqual({ ok: false, error: "not_found" });
    expect(await rejectAppeal(docsOnly, study.id, "Причина отказа", now)).toEqual({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
    // контроль: своё (справка Алины в отделе docs) этот сотрудник видит
    const docsAppeal = (await appealsOf(alina)).find((a) => a.type_code === "cert_military")!;
    expect(await getQueueAppeal(docsOnly, docsAppeal.id, now)).not.toBeNull();
  });

  it("студент не может вызвать функции сотрудника (viewer студента → not_found / пусто)", async () => {
    const asStaff = alina as unknown as StaffViewer;
    const own = (await appealsOf(alina))[0];
    for (const tab of ["new", "in_progress", "waiting", "closed"] as const) {
      expect(await listQueue(asStaff, tab, undefined, now)).toEqual([]);
    }
    expect(await getQueueAppeal(asStaff, own.id, now)).toBeNull();
    expect(await getStaffSummary(asStaff, now)).toEqual({ new: 0, inProgress: 0, overdue: 0, avgFirstResponseHoursWeek: null });
    const before = await snapshot();
    expect(await takeAppeal(asStaff, own.id, now)).toEqual({ ok: false, error: "not_found" });
    expect(await replyAppeal(asStaff, own.id, "Ответ", now)).toEqual({ ok: false, error: "not_found" });
    expect(await requestInfo(asStaff, own.id, "Вопрос", now)).toEqual({ ok: false, error: "not_found" });
    expect(await markReady(asStaff, own.id, { place: "каб. 214", until: new Date(now.getTime() + 86_400_000) }, now))
      .toEqual({ ok: false, error: "not_found" });
    expect(await rejectAppeal(asStaff, own.id, "Причина отказа", now)).toEqual({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
  });
});
