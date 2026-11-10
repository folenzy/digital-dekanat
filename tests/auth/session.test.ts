import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { createSession, destroySession, getSessionUser, SESSION_TTL_MS } from "@/server/auth/session";
import { closeTestDb, testSql } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const now = new Date("2026-11-10T09:00:00Z");
const MIN = 60_000;

async function userId(login: string): Promise<string> {
  const [row] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return row.id;
}

describe("сессии", () => {
  beforeAll(() => buildDemoWorld(db, now, pw));
  beforeEach(async () => {
    await testSql`delete from sessions`;
  });
  afterAll(closeTestDb);

  it("токен — 32 случайных байта в base64url, в БД только его sha-256", async () => {
    const alina = await userId("alina.mironova");
    const a = await createSession(alina, "Mozilla/5.0 test", now);
    const b = await createSession(alina, null, now);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(7 * 24 * 3600_000);

    const rows = await testSql<{ token_hash: string }[]>`select token_hash from sessions`;
    expect(rows).toHaveLength(2);
    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    expect(rows.map((r) => r.token_hash).sort()).toEqual([sha(a.token), sha(b.token)].sort());
    const dump = JSON.stringify(await testSql`select * from sessions`);
    expect(dump).not.toContain(a.token);
    expect(dump).not.toContain(b.token);
  });

  it("getSessionUser возвращает пользователя и роль", async () => {
    const alina = await userId("alina.mironova");
    const irina = await userId("irina.belova");
    const sa = await createSession(alina, null, now);
    const si = await createSession(irina, null, now);
    expect(await getSessionUser(sa.token, now)).toEqual({ userId: alina, role: "student" });
    expect(await getSessionUser(si.token, now)).toEqual({ userId: irina, role: "staff" });
  });

  it("неизвестный, пустой или подделанный токен — null", async () => {
    const alina = await userId("alina.mironova");
    const { token } = await createSession(alina, null, now);
    expect(await getSessionUser("", now)).toBeNull();
    expect(await getSessionUser("x".repeat(43), now)).toBeNull();
    // хеш из БД как токен не принимается
    const [{ token_hash }] = await testSql<{ token_hash: string }[]>`select token_hash from sessions`;
    expect(await getSessionUser(token_hash, now)).toBeNull();
    expect(await getSessionUser(token, now)).not.toBeNull();
  });

  it("истекшая сессия → null и удаляется из БД", async () => {
    const alina = await userId("alina.mironova");
    const { token, expiresAt } = await createSession(alina, null, now);
    expect(await getSessionUser(token, new Date(expiresAt.getTime() - 1000))).not.toBeNull();
    expect(await getSessionUser(token, expiresAt)).toBeNull();
    expect(await testSql`select 1 from sessions`).toHaveLength(0);
  });

  it("при создании сессии удаляются истекшие сессии того же пользователя", async () => {
    const alina = await userId("alina.mironova");
    const denis = await userId("denis.kravtsov");
    await createSession(alina, null, new Date(now.getTime() - SESSION_TTL_MS - MIN));
    await createSession(denis, null, new Date(now.getTime() - SESSION_TTL_MS - MIN));
    await createSession(alina, null, now);
    const rows = await testSql<{ user_id: string }[]>`select user_id from sessions`;
    expect(rows.map((r) => r.user_id).sort()).toEqual([alina, denis].sort());
  });

  it("last_seen_at обновляется не чаще раза в минуту", async () => {
    const alina = await userId("alina.mironova");
    const { token } = await createSession(alina, null, now);
    const lastSeen = async () =>
      (await db.select({ t: s.sessions.lastSeenAt }).from(s.sessions))[0].t.getTime();
    expect(await lastSeen()).toBe(now.getTime());
    await getSessionUser(token, new Date(now.getTime() + 30_000));
    expect(await lastSeen()).toBe(now.getTime());
    const later = new Date(now.getTime() + 2 * MIN);
    await getSessionUser(token, later);
    expect(await lastSeen()).toBe(later.getTime());
  });

  it("destroySession удаляет только свою сессию", async () => {
    const alina = await userId("alina.mironova");
    const a = await createSession(alina, null, now);
    const b = await createSession(alina, null, now);
    await destroySession(a.token);
    expect(await getSessionUser(a.token, now)).toBeNull();
    expect(await getSessionUser(b.token, now)).not.toBeNull();
    await destroySession("");
    await destroySession("unknown-token");
    expect(await testSql`select 1 from sessions`).toHaveLength(1);
  });

  it("длинный user-agent обрезается", async () => {
    const alina = await userId("alina.mironova");
    await createSession(alina, "A".repeat(5000), now);
    const [{ ua }] = await testSql<{ ua: string }[]>`select user_agent ua from sessions`;
    expect(ua.length).toBeLessThanOrEqual(256);
  });
});
