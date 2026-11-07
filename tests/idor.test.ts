import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StudentViewer } from "@/server/auth/viewer";
import { getProfile } from "@/server/profile";
import { getDay, getTodayOverview, getWeek } from "@/server/schedule";
import { getStudySummary } from "@/server/grades";
import { listAnnouncementsFor } from "@/server/announcements";
import { listUpcomingDeadlines } from "@/server/deadlines";
import { listNotifications, markAllRead, markRead, unreadCount } from "@/server/notifications";
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
