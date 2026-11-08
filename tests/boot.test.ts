import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareDatabase, retry } from "@/server/boot";
import { closeTestDb, testSql, truncateAll } from "./helpers/db";

const url = process.env.DATABASE_URL_TEST!;
const noSleep = async () => {};
const quiet = () => {};

/** Минимальный «демо-мир»: один пользователь, чтобы следующий старт увидел непустую базу. */
async function seedOneUser(): Promise<void> {
  await new Promise((r) => setTimeout(r, 300)); // соседний старт успел бы проскочить без блокировки
  await testSql`insert into users (login, role) values ('boot.test', 'student')`;
}

describe("retry", () => {
  it("повторяет после ошибок с заданными паузами и возвращает результат", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn(noSleep);
    const onRetry = vi.fn();
    await expect(retry(fn, [10, 20, 40], { sleep, onRetry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("после последней паузы пробрасывает последнюю ошибку", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("still down"));
    await expect(retry(fn, [1, 1], { sleep: noSleep })).rejects.toThrow("still down");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("prepareDatabase", () => {
  beforeEach(truncateAll);
  afterAll(closeTestDb);

  it("пустая база: миграции и сид; база с пользователями: сид не вызывается", async () => {
    const seed = vi.fn(seedOneUser);
    await expect(prepareDatabase(url, { seed, delaysMs: [], log: quiet })).resolves.toBe("seeded");
    expect(seed).toHaveBeenCalledTimes(1);
    await expect(prepareDatabase(url, { seed, delaysMs: [], log: quiet })).resolves.toBe("ready");
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("две копии приложения стартуют одновременно на пустой базе — сид ровно один раз", async () => {
    const seed = vi.fn(seedOneUser);
    const results = await Promise.all([
      prepareDatabase(url, { seed, delaysMs: [], log: quiet }),
      prepareDatabase(url, { seed, delaysMs: [], log: quiet }),
    ]);
    expect(results.sort()).toEqual(["ready", "seeded"]);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(await testSql`select 1 from users`).toHaveLength(1);
  });

  it("БД недоступна: повторяет подключение и сдаётся с ошибкой, сид не вызывается", async () => {
    const seed = vi.fn(seedOneUser);
    const log = vi.fn();
    const down = "postgres://nobody:pw@127.0.0.1:1/none";
    await expect(prepareDatabase(down, { seed, delaysMs: [1, 1], log, sleep: noSleep })).rejects.toThrow();
    expect(log).toHaveBeenCalledTimes(2); // две повторные попытки
    expect(log.mock.calls.flat().join(" ")).not.toContain("pw@");
    expect(seed).not.toHaveBeenCalled();
  });
});
