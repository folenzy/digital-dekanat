import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest } from "next/server";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { createSession } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { replyAppeal } from "@/server/appeals/staff";
import { createAnnouncement } from "@/server/announcements";
import { listenReady, publish, stopRealtime, subscribe, subscriberCount, type LiveEvent } from "@/server/realtime";
import { openEventStream } from "@/server/events-stream";
import { sql as appSql } from "@/server/db/client";
import { closeTestDb, testSql } from "./helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const NOW = new Date("2026-11-10T09:00:00Z");

let alina: StudentViewer;
let denis: StudentViewer;
let irina: StaffViewer;

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

/** Подписчик, копящий события; отписывается в afterAll. */
const unsubs: Array<() => void> = [];
function listen(userId: string): LiveEvent[] {
  const got: LiveEvent[] = [];
  unsubs.push(subscribe(userId, (e) => got.push(e)));
  return got;
}

/** Контрольное событие идёт через тот же NOTIFY после проверяемых, значит они уже доставлены. */
async function settle(): Promise<void> {
  const probe = crypto.randomUUID();
  const got: LiveEvent[] = [];
  const off = subscribe(probe, (e) => got.push(e));
  await publish([probe], { type: "notification", title: "probe" });
  await vi.waitFor(() => expect(got).toHaveLength(1));
  off();
}

beforeAll(async () => {
  await buildDemoWorld(db, NOW, pw);
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  denis = (await viewerOf("denis.kravtsov")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
  await listenReady();
});
afterAll(async () => {
  unsubs.forEach((u) => u());
  await stopRealtime();
  await appSql.end();
  await closeTestDb();
});

describe("subscribe", () => {
  it("подписчик Алины получает своё событие (без списка адресатов) и не получает событие Дениса", async () => {
    const forAlina = listen(alina.userId);
    const forDenis = listen(denis.userId);
    await publish([alina.userId], { type: "notification", title: "Алине" });
    await publish([denis.userId], { type: "announcement", title: "Денису", href: "/x" });
    await settle();
    expect(forAlina).toEqual([{ type: "notification", title: "Алине" }]);
    expect(forDenis).toEqual([{ type: "announcement", title: "Денису", href: "/x" }]);
  });

  it("после отписки событий нет", async () => {
    const got: LiveEvent[] = [];
    const off = subscribe(alina.userId, (e) => got.push(e));
    off();
    await publish([alina.userId], { type: "notification", title: "после отписки" });
    await settle();
    expect(got).toEqual([]);
  });

  it("replyAppeal по обращению Дениса доходит только Денису", async () => {
    const forAlina = listen(alina.userId);
    const forDenis = listen(denis.userId);
    const [a] = await db.select().from(s.appeals)
      .where(and(eq(s.appeals.studentId, denis.studentId), eq(s.appeals.typeCode, "study_retake")));
    expect((await replyAppeal(irina, a.id, "Дата подходит?", NOW)).ok).toBe(true);
    await vi.waitFor(() => expect(forDenis).toHaveLength(1));
    await settle();
    expect(forDenis[0]).toMatchObject({ type: "notification", appealId: a.id, href: `/dekanat/${a.id}` });
    expect(forAlina).toEqual([]);
  });

  it("400 адресатов режутся на пачки, получают все", async () => {
    const ids = Array.from({ length: 400 }, () => crypto.randomUUID());
    const sinks = ids.map((id) => listen(id));
    await publish(ids, { type: "notification", title: "всем" });
    await vi.waitFor(() => expect(sinks.every((g) => g.length === 1)).toBe(true));
    await settle();
    expect(sinks.every((g) => g.length === 1)).toBe(true);
  });
});

describe("GET /api/events", () => {
  const url = "http://localhost/api/events";
  const withCookie = (token: string) =>
    new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE.name}=${token}` } });

  async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, ms = 3000): Promise<string> {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("нет данных за таймаут")), ms));
    const { value } = await Promise.race([reader.read(), timeout]);
    return new TextDecoder().decode(value);
  }

  it("без cookie и с неверным токеном — 401", async () => {
    expect((await openEventStream(new NextRequest(url))).status).toBe(401);
    expect((await openEventStream(withCookie("nope"))).status).toBe(401);
  });

  it("с сессией — text/event-stream, приходят только свои события", async () => {
    const { token } = await createSession(alina.userId, "vitest", new Date());
    const ac = new AbortController();
    const res = await openEventStream(new NextRequest(url, {
      headers: { cookie: `${SESSION_COOKIE.name}=${token}` }, signal: ac.signal,
    }), 60_000);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const reader = res.body!.getReader();
    expect(await readChunk(reader)).toBe(": connected\n\n");
    await publish([denis.userId], { type: "notification", title: "чужое" });
    await publish([alina.userId], { type: "notification", title: "своё" });
    expect(await readChunk(reader)).toBe(`data: ${JSON.stringify({ type: "notification", title: "своё" })}\n\n`);
    ac.abort();
    await reader.cancel().catch(() => {});
  });

  it("на ударе сердца: пинг, а после выхода — session_end и конец потока", async () => {
    const { token } = await createSession(alina.userId, "vitest", new Date());
    const res = await openEventStream(withCookie(token), 80);
    const reader = res.body!.getReader();
    expect(await readChunk(reader)).toBe(": connected\n\n");
    expect(await readChunk(reader)).toBe(": ping\n\n");
    await testSql`delete from sessions where user_id = ${alina.userId}`;
    let text = "";
    for (let i = 0; i < 5 && !text.includes("session_end"); i++) text += await readChunk(reader);
    expect(text).toContain("event: session_end\ndata: {}\n\n");
    await vi.waitFor(async () => expect((await reader.read()).done).toBe(true));
  });
});

describe("createAnnouncement", () => {
  const groupNamed = async (name: string) => {
    const [g] = await db.select().from(s.groups).where(eq(s.groups.name, name));
    return g;
  };
  const noteCount = async (userId: string, title: string) =>
    (await db.select().from(s.notifications)
      .where(and(eq(s.notifications.userId, userId), eq(s.notifications.title, title)))).length;

  it("группа ЭК-24-2: уведомление и событие получает Денис, Алина нет", async () => {
    const g = await groupNamed("ЭК-24-2");
    const forAlina = listen(alina.userId);
    const forDenis = listen(denis.userId);
    const r = await createAnnouncement(irina, {
      title: "Перенос консультации", body: "Консультация переносится на пятницу, 14:00.",
      important: false, audience: { groupId: g.id },
    }, NOW);
    expect(r.ok).toBe(true);
    await vi.waitFor(() => expect(forDenis).toHaveLength(1));
    await settle();
    expect(forDenis[0]).toEqual({
      type: "announcement", title: "Перенос консультации", href: "/notifications?tab=announcements",
    });
    expect(forAlina).toEqual([]);
    expect(await noteCount(denis.userId, "Перенос консультации")).toBe(1);
    expect(await noteCount(alina.userId, "Перенос консультации")).toBe(0);
    if (r.ok) {
      const [a] = await db.select().from(s.announcements).where(eq(s.announcements.id, r.value.id));
      expect(a).toMatchObject({ audienceGroupId: g.id, audienceCourse: null, important: false });
    }
  });

  it("курс 2: Алина получает, Денис нет", async () => {
    const r = await createAnnouncement(irina, {
      title: "Для второго курса", body: "Собрание второго курса в актовом зале.",
      important: true, audience: { course: 2 },
    }, NOW);
    expect(r.ok).toBe(true);
    expect(await noteCount(alina.userId, "Для второго курса")).toBe(1);
    expect(await noteCount(denis.userId, "Для второго курса")).toBe(0);
  });

  it("валидация: длины, курс, неизвестные факультет и группа, несовместимая группа", async () => {
    const g = await groupNamed("ЭК-24-2");
    const base = { title: "Заголовок", body: "Достаточно длинный текст.", important: false, audience: {} };
    const bad = (patch: object) => createAnnouncement(irina, { ...base, ...patch }, NOW);
    expect(await bad({ title: "ab" })).toMatchObject({ ok: false, error: "validation", fieldErrors: { title: expect.any(String) } });
    expect(await bad({ title: "я".repeat(121) })).toMatchObject({ ok: false, error: "validation" });
    expect(await bad({ body: "коротко" })).toMatchObject({ ok: false, error: "validation", fieldErrors: { body: expect.any(String) } });
    expect(await bad({ body: "я".repeat(3001) })).toMatchObject({ ok: false, error: "validation" });
    expect(await bad({ audience: { course: 7 } })).toMatchObject({ ok: false, error: "validation" });
    expect(await bad({ audience: { facultyId: 99999 } })).toMatchObject({
      ok: false, error: "validation", fieldErrors: { "audience.facultyId": expect.any(String) },
    });
    expect(await bad({ audience: { groupId: 99999 } })).toMatchObject({
      ok: false, error: "validation", fieldErrors: { "audience.groupId": expect.any(String) },
    });
    expect(await bad({ audience: { groupId: g.id, course: g.course + 1 } })).toMatchObject({ ok: false, error: "validation" });
  });

  it("лимит: 10 объявлений в час, одиннадцатое отклоняется", async () => {
    await testSql`delete from action_log where user_id = ${irina.userId}`;
    const g = await groupNamed("ПМИ-25-1");
    const make = () => createAnnouncement(irina, {
      title: "Лимитный тест", body: "Текст объявления для лимита.", important: false, audience: { groupId: g.id },
    }, NOW);
    for (let i = 0; i < 10; i++) expect((await make()).ok).toBe(true);
    expect(await make()).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("утечки потока при отключении клиента", () => {
  const url = "http://localhost/api/events";
  const reqWith = (token: string, signal?: AbortSignal) =>
    new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE.name}=${token}` }, signal });

  it("abort снимает подписку и таймер пульса", async () => {
    const { token } = await createSession(alina.userId, "vitest", new Date());
    const before = subscriberCount();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const ac = new AbortController();
      const res = await openEventStream(reqWith(token, ac.signal), 1000);
      await res.body!.getReader().read();
      expect(subscriberCount()).toBe(before + 1);
      expect(vi.getTimerCount()).toBe(1);
      ac.abort();
      expect(subscriberCount()).toBe(before);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("abort до открытия потока: подписки и таймеры не создаются", async () => {
    const { token } = await createSession(alina.userId, "vitest", new Date());
    const before = subscriberCount();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const ac = new AbortController();
      ac.abort();
      const res = await openEventStream(reqWith(token, ac.signal), 1000);
      expect(res.body).toBeNull();
      expect(subscriberCount()).toBe(before);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("?probe=1: 204 с сессией, 401 без неё, поток не открывается", async () => {
    const { token } = await createSession(alina.userId, "vitest", new Date());
    const before = subscriberCount();
    const ok = await openEventStream(new NextRequest(`${url}?probe=1`, { headers: reqWith(token).headers }));
    expect(ok.status).toBe(204);
    expect((await openEventStream(new NextRequest(`${url}?probe=1`))).status).toBe(401);
    expect(subscriberCount()).toBe(before);
  });
});
