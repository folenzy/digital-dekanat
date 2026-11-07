import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { LOGIN_INVALID_MESSAGE, login, rateLimitedMessage } from "@/server/auth/login";
import { getSessionUser } from "@/server/auth/session";
import { closeTestDb, testSql } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const t0 = new Date("2026-11-10T09:00:00Z");
const MIN = 60_000;
const at = (minutes: number) => new Date(t0.getTime() + minutes * MIN);
const IP_A = "203.0.113.10";
const IP_B = "198.51.100.20";

describe("login", () => {
  beforeAll(() => buildDemoWorld(db, t0, pw));
  beforeEach(async () => {
    await testSql`delete from sessions`;
    await testSql`delete from login_attempts`;
  });
  afterAll(closeTestDb);

  it("верный логин и пароль: сессия и роль", async () => {
    const r = await login("alina.mironova", pw.alina, IP_A, t0);
    expect(r).toMatchObject({ ok: true, role: "student" });
    if (!r.ok) throw new Error("unreachable");
    const [u] = await testSql<{ id: string }[]>`select id from users where login = 'alina.mironova'`;
    expect(await getSessionUser(r.token, t0)).toEqual({ userId: u.id, role: "student" });
    expect(r.expiresAt.getTime()).toBeGreaterThan(t0.getTime());

    const staff = await login("irina.belova", pw.irina, IP_A, t0);
    expect(staff).toMatchObject({ ok: true, role: "staff" });
  });

  it("логин без учёта регистра и пробелов по краям", async () => {
    expect(await login("  Alina.Mironova ", pw.alina, IP_A, t0)).toMatchObject({ ok: true });
  });

  it("неверный пароль и неизвестный логин — одинаковый ответ, сессия не создаётся", async () => {
    const wrongPassword = await login("alina.mironova", "wrong-password", IP_A, t0);
    const unknownLogin = await login("no.such.user", "wrong-password", IP_A, t0);
    const otherPassword = await login("alina.mironova", pw.denis, IP_A, t0);
    expect(wrongPassword).toEqual({ ok: false, error: "invalid" });
    expect(unknownLogin).toEqual(wrongPassword);
    expect(otherPassword).toEqual(wrongPassword);
    expect(await testSql`select 1 from sessions`).toHaveLength(0);
  });

  it("пароль чувствителен к регистру и пробелам", async () => {
    expect(await login("alina.mironova", pw.alina.toUpperCase(), IP_A, t0)).toMatchObject({ ok: false });
    expect(await login("alina.mironova", ` ${pw.alina}`, IP_A, t0)).toMatchObject({ ok: false });
  });

  it("вымышленные студенты без логина или без пароля войти не могут", async () => {
    const [tikhonov] = await testSql<{ id: string }[]>`
      select u.id from users u join students st on st.user_id = u.id where st.last_name = 'Тихонов'`;
    expect(tikhonov).toBeDefined();
    // логин есть, хеша пароля нет
    await testSql`update users set login = 'test.nopassword' where id = ${tikhonov.id}`;
    try {
      for (const password of ["", "null", "anything", pw.alina]) {
        expect(await login("test.nopassword", password, IP_A, t0)).toEqual({ ok: false, error: "invalid" });
      }
    } finally {
      await testSql`update users set login = null where id = ${tikhonov.id}`;
    }
    expect(await login("", "", IP_B, t0)).toEqual({ ok: false, error: "invalid" });
    expect(await login("null", "null", IP_B, t0)).toEqual({ ok: false, error: "invalid" });
    expect(await testSql`select 1 from sessions`).toHaveLength(0);
  });

  it("6-я попытка после 5 неудач с той же пары логин+IP — rate_limited даже с верным паролем", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await login("alina.mironova", `wrong-${i}`, IP_A, at(i))).toEqual({ ok: false, error: "invalid" });
    }
    const r = await login("alina.mironova", pw.alina, IP_A, at(5));
    // первая неудача в t0 выйдет из 15-минутного окна в t0+15 мин: ждать 10 минут
    expect(r).toEqual({ ok: false, error: "rate_limited", retryAfterSec: 600 });
    expect(await testSql`select 1 from sessions`).toHaveLength(0);
  });

  it("логин в другом регистре считается той же парой", async () => {
    for (let i = 0; i < 5; i++) {
      const name = i % 2 ? "ALINA.MIRONOVA" : "alina.mironova";
      await login(name, `wrong-${i}`, IP_A, at(i));
    }
    expect(await login("Alina.Mironova", pw.alina, IP_A, at(5))).toMatchObject({ error: "rate_limited" });
  });

  it("блокировка пары не мешает войти тому же логину с другого IP (нет DoS по логину)", async () => {
    for (let i = 0; i < 6; i++) await login("alina.mironova", `wrong-${i}`, IP_A, at(i));
    expect(await login("alina.mironova", pw.alina, IP_A, at(6))).toMatchObject({ error: "rate_limited" });
    expect(await login("alina.mironova", pw.alina, IP_B, at(6))).toMatchObject({ ok: true, role: "student" });
    // и другой логин с того же IP тоже не заблокирован
    expect(await login("denis.kravtsov", pw.denis, IP_A, at(6))).toMatchObject({ ok: true });
  });

  it("попытки во время блокировки не продлевают её; после окна вход снова работает", async () => {
    for (let i = 0; i < 5; i++) await login("alina.mironova", `wrong-${i}`, IP_A, at(i));
    for (let i = 5; i < 15; i++) {
      expect(await login("alina.mironova", "wrong", IP_A, at(i))).toMatchObject({ error: "rate_limited" });
    }
    const [{ n }] = await testSql<{ n: number }[]>`
      select count(*)::int n from login_attempts where key = 'pair:alina.mironova|203.0.113.10'`;
    expect(n).toBe(5);
    // в t0+15 мин первая неудача выходит из окна
    expect(await login("alina.mironova", pw.alina, IP_A, at(15))).toMatchObject({ ok: true });
  });

  it("успешный вход сбрасывает счётчик пары", async () => {
    for (let i = 0; i < 4; i++) await login("alina.mironova", `wrong-${i}`, IP_A, at(i));
    expect(await login("alina.mironova", pw.alina, IP_A, at(4))).toMatchObject({ ok: true });
    for (let i = 0; i < 5; i++) {
      expect(await login("alina.mironova", `wrong-${i}`, IP_A, at(5))).toEqual({ ok: false, error: "invalid" });
    }
    expect(await login("alina.mironova", pw.alina, IP_A, at(5))).toMatchObject({ error: "rate_limited" });
  });

  it("30 неудач с одного IP по разным логинам блокируют этот IP, другие IP работают", async () => {
    for (let i = 0; i < 30; i++) {
      expect(await login(`guess.${i}`, "x", IP_A, at(0))).toEqual({ ok: false, error: "invalid" });
    }
    const blocked = await login("irina.belova", pw.irina, IP_A, at(1));
    expect(blocked).toEqual({ ok: false, error: "rate_limited", retryAfterSec: 14 * 60 });
    expect(await login("irina.belova", pw.irina, IP_B, at(1))).toMatchObject({ ok: true, role: "staff" });
  });

  // Параллельные POST не должны проскакивать между проверкой лимита и записью неудачи.
  const tally = (rs: Awaited<ReturnType<typeof login>>[]) => ({
    invalid: rs.filter((r) => !r.ok && r.error === "invalid").length,
    limited: rs.filter((r) => !r.ok && r.error === "rate_limited").length,
  });

  it("20 одновременных неверных попыток с одной пары: не больше 5 проверок пароля", async () => {
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) => login("alina.mironova", `wrong-${i}`, IP_A, at(0))),
    );
    const { invalid, limited } = tally(rs);
    expect(invalid).toBeLessThanOrEqual(5);
    expect(invalid + limited).toBe(20);
    const [{ n }] = await testSql<{ n: number }[]>`
      select count(*)::int n from login_attempts where key = 'pair:alina.mironova|203.0.113.10'`;
    expect(n).toBe(invalid);
  });

  it("40 одновременных попыток по разным логинам с одного IP: не больше 30 проверок пароля", async () => {
    const rs = await Promise.all(
      Array.from({ length: 40 }, (_, i) => login(`guess.${i}`, "x", IP_A, at(0))),
    );
    const { invalid, limited } = tally(rs);
    expect(invalid).toBeLessThanOrEqual(30);
    expect(invalid + limited).toBe(40);
    const [{ n }] = await testSql<{ n: number }[]>`
      select count(*)::int n from login_attempts where key = 'ip:203.0.113.10'`;
    expect(n).toBe(invalid);
  });

  it("после неудач в окне параллельный всплеск добирает только остаток лимита", async () => {
    for (let i = 0; i < 3; i++) await login("alina.mironova", `wrong-${i}`, IP_A, at(i));
    const rs = await Promise.all(
      Array.from({ length: 10 }, (_, i) => login("alina.mironova", `burst-${i}`, IP_A, at(3))),
    );
    const { invalid } = tally(rs);
    expect(invalid).toBeLessThanOrEqual(2);
    const [{ n }] = await testSql<{ n: number }[]>`
      select count(*)::int n from login_attempts where key = 'pair:alina.mironova|203.0.113.10'`;
    expect(n).toBe(3 + invalid);
  });

  it("сообщения для пользователя", () => {
    expect(LOGIN_INVALID_MESSAGE).toBe("Неверный логин или пароль");
    expect(rateLimitedMessage(600)).toBe("Слишком много попыток, попробуй через 10 мин");
    expect(rateLimitedMessage(601)).toBe("Слишком много попыток, попробуй через 11 мин");
    expect(rateLimitedMessage(1)).toBe("Слишком много попыток, попробуй через 1 мин");
  });
});
