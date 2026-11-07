import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { login } from "@/server/auth/login";
import { verifyPassword } from "@/server/auth/password";
import { closeTestDb, testSql } from "../helpers/db";

// Оборачиваем настоящий verifyPassword, чтобы видеть, с каким хешем его вызывают.
vi.mock("@/server/auth/password", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/auth/password")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const now = new Date("2026-11-10T09:00:00Z");
const spy = vi.mocked(verifyPassword);

describe("login: сопоставимое время для неизвестного логина", () => {
  beforeAll(() => buildDemoWorld(db, now, pw));
  beforeEach(async () => {
    await testSql`delete from login_attempts`;
    spy.mockClear();
  });
  afterAll(closeTestDb);

  it("неизвестный логин всё равно проверяет пароль по фиктивному argon2id-хешу", async () => {
    await login("no.such.user", "guess", "203.0.113.1", now);
    expect(spy).toHaveBeenCalledTimes(1);
    const [hash, password] = spy.mock.calls[0];
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(password).toBe("guess");
  });

  it("пользователь без хеша пароля тоже проходит через verifyPassword", async () => {
    const [u] = await testSql<{ id: string }[]>`
      select u.id from users u join students st on st.user_id = u.id where st.last_name = 'Соколова'`;
    await testSql`update users set login = 'test.nohash' where id = ${u.id}`;
    try {
      expect(await login("test.nohash", "guess", "203.0.113.1", now)).toEqual({ ok: false, error: "invalid" });
    } finally {
      await testSql`update users set login = null where id = ${u.id}`;
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/^\$argon2id\$/);
  });

  it("при заблокированной паре пароль не проверяется вовсе", async () => {
    for (let i = 0; i < 5; i++) await login("alina.mironova", `wrong-${i}`, "203.0.113.1", now);
    spy.mockClear();
    expect(await login("alina.mironova", pw.alina, "203.0.113.1", now)).toMatchObject({ error: "rate_limited" });
    expect(spy).not.toHaveBeenCalled();
  });
});
