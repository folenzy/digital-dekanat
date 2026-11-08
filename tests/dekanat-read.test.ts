import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { getAppealRoute } from "@/server/appeals/catalog";
import { listAppealDisciplines } from "@/server/grades";
import { closeTestDb, testSql } from "./helpers/db";

// Чтение для мастера обращений: куда уйдёт подтип и какие дисциплины можно выбрать для пересдачи.

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const TUE = new Date("2026-11-10T09:00:00Z"); // вторник, 12:00 МСК

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

let alina: StudentViewer;
let denis: StudentViewer;
let irina: StaffViewer;

beforeAll(async () => {
  await buildDemoWorld(db, TUE, pw);
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  denis = (await viewerOf("denis.kravtsov")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
});
afterAll(closeTestDb);

describe("getAppealRoute", () => {
  it("отдел и срок подтипа — из справочника appeal_types", async () => {
    expect(await getAppealRoute("cert_military")).toEqual({
      department: { id: expect.any(Number), code: "docs", name: "Справки и документы" }, slaDays: 1,
    });
    expect(await getAppealRoute("study_retake")).toMatchObject({ department: { name: "Учебный отдел" }, slaDays: 2 });
    expect(await getAppealRoute("stip_increased")).toMatchObject({ department: { name: "Стипендиальный отдел" }, slaDays: 3 });
  });

  it("неизвестный код → null без ошибки Postgres", async () => {
    expect(await getAppealRoute("nope" as never)).toBeNull();
  });
});

describe("listAppealDisciplines", () => {
  it("Денис: сначала долги прошлых сессий, затем дисциплины текущего семестра", async () => {
    const list = await listAppealDisciplines(denis, TUE);
    expect(list[0]).toEqual({ id: expect.any(Number), name: "Статистика", debt: true });
    expect(list.filter((d) => d.debt).map((d) => d.name)).toEqual(["Статистика"]);
    expect(list.filter((d) => !d.debt).map((d) => d.name)).toEqual([
      "Бухгалтерский учёт", "Корпоративное право", "Макроэкономика", "Профессиональный иностранный язык",
      "Финансовый менеджмент", "Эконометрика",
    ]);
    // закрытые предметы прошлых семестров (Микроэкономика — «4») не предлагаются
    expect(list.map((d) => d.name)).not.toContain("Микроэкономика");
  });

  it("Алина: долгов нет — только текущий семестр; чужих дисциплин нет", async () => {
    const list = await listAppealDisciplines(alina, TUE);
    expect(list.every((d) => !d.debt)).toBe(true);
    expect(list.map((d) => d.name)).toContain("Математический анализ");
    expect(list.map((d) => d.name)).not.toContain("Статистика");
    expect(list.map((d) => d.name)).not.toContain("Линейная алгебра"); // прошлый семестр, сдан
  });

  it("сотрудник, переданный вместо студента, получает пустой список", async () => {
    expect(await listAppealDisciplines(irina as unknown as StudentViewer, TUE)).toEqual([]);
  });

  it("выбранная из списка дисциплина проходит проверку createAppeal (своя запись)", async () => {
    const { createAppeal } = await import("@/server/appeals/service");
    const [debt] = await listAppealDisciplines(denis, TUE);
    const res = await createAppeal(denis, "study_retake", { text: "Хочу пересдать статистику", disciplineId: debt.id }, TUE);
    expect(res.ok).toBe(true);
  });
});
