import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { getAnswerProvider, searchKb } from "@/server/kb";
import { closeTestDb, testSql, truncateAll } from "./helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };

beforeAll(async () => {
  await truncateAll();
  await buildDemoWorld(db, new Date("2026-11-10T09:00:00Z"), pw);
});
afterAll(closeTestDb);

describe("searchKb", () => {
  it("«справка в военкомат» → cert_military первым", async () => {
    const hits = await searchKb("справка в военкомат");
    expect(hits[0]?.appealTypeCode).toBe("cert_military");
  });

  it("«повышенная стипендия» → stip_increased", async () => {
    expect((await searchKb("повышенная стипендия"))[0]?.appealTypeCode).toBe("stip_increased");
  });

  it("«пересдать экзамен» → study_retake", async () => {
    expect((await searchKb("пересдать экзамен"))[0]?.appealTypeCode).toBe("study_retake");
  });

  it("естественный вопрос находит ответ через OR-запасной вариант", async () => {
    const hits = await searchKb("как получить справку в военкомат?");
    expect(hits[0]?.appealTypeCode).toBe("cert_military");
  });

  it("«когда платят стипендию» → вопрос про дату выплаты", async () => {
    const hits = await searchKb("когда платят стипендию");
    expect(hits[0]?.appealTypeCode).toBe("stip_payment_question");
  });

  it("«хочу взять академ по болезни» → study_academic_leave", async () => {
    expect((await searchKb("хочу взять академ по болезни"))[0]?.appealTypeCode).toBe("study_academic_leave");
  });

  it("одно настоящее слово + бессмыслица не даёт случайных статей", async () => {
    expect(await searchKb("получить пиццу доставкой бесплатно")).toEqual([]);
    expect(await searchKb("справка о погоде на марсе")).toEqual([]);
  });

  it("запрос, не прошедший строгий AND, находится запасным поиском", async () => {
    const hits = await searchKb("хочу справку для военкомата срочно");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].appealTypeCode).toBe("cert_military");
  });

  it("символы синтаксиса tsquery не роняют поиск", async () => {
    await expect(searchKb("a & | ! :* ( ' \"")).resolves.toEqual([]);
    await expect(searchKb("справка & | ! :* ( ' \" военкомат")).resolves.toBeInstanceOf(Array);
  });

  it("бессмыслица → []", async () => {
    expect(await searchKb("абырвалг")).toEqual([]);
    expect(await searchKb("абырвалг глокая куздра")).toEqual([]);
  });

  it("короче 3 символов → []", async () => {
    expect(await searchKb("  аб ")).toEqual([]);
    expect(await searchKb("")).toEqual([]);
  });

  it("SQL-инъекция безвредна, таблица на месте", async () => {
    expect(await searchKb("'; drop table users; --")).toEqual([]);
    const [{ n }] = await testSql<{ n: number }[]>`select count(*)::int as n from users`;
    expect(n).toBeGreaterThan(0);
  });

  it("длинный запрос обрезается до 200 символов и не падает", async () => {
    const hits = await searchKb("справка ".repeat(100));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("limit ограничивает число результатов; excerpt короткий, answer полный", async () => {
    const hits = await searchKb("справка", 2);
    expect(hits).toHaveLength(2);
    for (const h of hits) {
      expect(h.answerExcerpt.length).toBeLessThanOrEqual(165);
      expect(h.answerExcerpt.endsWith("…")).toBe(true);
      expect(h.answer.length).toBeGreaterThan(h.answerExcerpt.length);
      expect(h.topic).toBeTruthy();
    }
  });
});

describe("getAnswerProvider", () => {
  it("по умолчанию выключен", () => {
    expect(getAnswerProvider()).toBeNull();
  });
});
