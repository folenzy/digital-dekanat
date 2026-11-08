import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { consumeAction, releaseAction, reserveAction } from "@/server/limits";
import { closeTestDb, testSql, truncateAll } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const NOW = new Date("2026-11-10T09:00:00Z");
const MIN = 60_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

let userA: string;
let userB: string;

async function rows(userId: string, action: string) {
  const [r] = await db.select({ n: count() }).from(s.actionLog)
    .where(and(eq(s.actionLog.userId, userId), eq(s.actionLog.action, action)));
  return r.n;
}

beforeEach(async () => {
  await truncateAll();
  const [a, b] = await db.insert(s.users).values([{ role: "student" }, { role: "student" }]).returning();
  userA = a.id;
  userB = b.id;
});
afterAll(closeTestDb);

describe("consumeAction", () => {
  it("лимит в окне: limit раз true, дальше false без записи; после окна снова можно", async () => {
    for (let i = 0; i < 3; i++) expect(await consumeAction(userA, "msg", 3, 10 * MIN, at(i * MIN))).toBe(true);
    expect(await consumeAction(userA, "msg", 3, 10 * MIN, at(5 * MIN))).toBe(false);
    expect(await rows(userA, "msg")).toBe(3);
    // запись из минуты 0 вышла из окна
    expect(await consumeAction(userA, "msg", 3, 10 * MIN, at(10 * MIN + 1))).toBe(true);
  });

  it("счётчики раздельны по пользователю и действию", async () => {
    for (let i = 0; i < 2; i++) expect(await consumeAction(userA, "msg", 2, 10 * MIN, NOW)).toBe(true);
    expect(await consumeAction(userA, "msg", 2, 10 * MIN, NOW)).toBe(false);
    expect(await consumeAction(userB, "msg", 2, 10 * MIN, NOW)).toBe(true);
    expect(await consumeAction(userA, "appeal", 2, 10 * MIN, NOW)).toBe(true);
  });

  // Параллельные тесты повторяются: исход зависит от того, как перемешаются запросы, и одна удача ничего не доказывает.
  const ROUNDS = 10;
  const burst = (n: number, action: string, limit: number) =>
    Promise.all(Array.from({ length: n }, () => consumeAction(userA, action, limit, 10 * MIN, NOW)));

  it("20 одновременных запросов при лимите 5: проходят ровно 5, записей столько же", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const action = `burst-${round}`;
      const passed = (await burst(20, action, 5)).filter(Boolean).length;
      expect({ round, passed }).toEqual({ round, passed: 5 });
      expect(await rows(userA, action)).toBe(5);
    }
  });

  it("после 3 записей в окне всплеск из 10 при лимите 5 добирает ровно остаток", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const action = `rest-${round}`;
      for (let i = 0; i < 3; i++) expect(await consumeAction(userA, action, 5, 10 * MIN, NOW)).toBe(true);
      const passed = (await burst(10, action, 5)).filter(Boolean).length;
      expect({ round, passed }).toEqual({ round, passed: 2 });
      expect(await rows(userA, action)).toBe(5);
    }
  });

  it("releaseAction возвращает резерв, если действие не состоялось", async () => {
    const id = await reserveAction(userA, "msg", 1, 10 * MIN, NOW);
    expect(id).toEqual(expect.any(Number));
    expect(await reserveAction(userA, "msg", 1, 10 * MIN, NOW)).toBeNull();
    await releaseAction(id!);
    expect(await rows(userA, "msg")).toBe(0);
    expect(await consumeAction(userA, "msg", 1, 10 * MIN, NOW)).toBe(true);
  });
});
