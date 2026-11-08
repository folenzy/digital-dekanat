import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { createAnnouncement, listAllAnnouncements, listAudienceOptions } from "@/server/announcements";
import { markReadByHref, unreadCount } from "@/server/notifications";
import { getStaffProfile } from "@/server/profile";
import { closeTestDb, testSql } from "./helpers/db";

// Кабинет сотрудника: помощники сервера для экранов (прочитать уведомления по ссылке, объявления, профиль).

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const TUE = new Date("2026-11-10T09:00:00Z"); // вторник, 12:00 МСК

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

let alina: StudentViewer;
let irina: StaffViewer;

beforeAll(async () => {
  await buildDemoWorld(db, TUE, pw);
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
});
afterAll(closeTestDb);

describe("markReadByHref", () => {
  it("помечает прочитанными только свои непрочитанные уведомления с этой ссылкой", async () => {
    const hrefs = await testSql<{ href: string }[]>`
      select href from notifications where user_id = ${irina.userId} and read_at is null order by id`;
    expect(hrefs).toHaveLength(3);
    const [first, ...rest] = hrefs.map((h) => h.href);
    expect(first).toMatch(/^\/staff\/appeals\/[0-9a-f-]{36}$/);

    // у Алины уведомление с той же ссылкой (как будто) — его трогать нельзя
    await testSql`insert into notifications (user_id, kind, title, body, href)
      values (${alina.userId}, 'appeal_status', 'Чужое', 'Тест', ${first})`;

    expect(await markReadByHref(irina, first)).toBe(1);
    expect(await unreadCount(irina)).toBe(2);
    // повторно — уже нечего помечать; остальные уведомления Ирины не тронуты
    expect(await markReadByHref(irina, first)).toBe(0);
    const left = await testSql<{ href: string }[]>`
      select href from notifications where user_id = ${irina.userId} and read_at is null order by id`;
    expect(left.map((l) => l.href)).toEqual(rest);

    const [alinas] = await testSql<{ read_at: Date | null }[]>`
      select read_at from notifications where user_id = ${alina.userId} and href = ${first}`;
    expect(alinas.read_at).toBeNull();
  });

  it("студент не может пометить уведомления сотрудника, даже зная ссылку", async () => {
    const [n] = await testSql<{ href: string }[]>`
      select href from notifications where user_id = ${irina.userId} and read_at is null`;
    expect(await markReadByHref(alina, n.href)).toBe(0);
    expect(await unreadCount(irina)).toBe(2);
  });

  it("пустая и чужая ссылка — ничего не меняет", async () => {
    expect(await markReadByHref(irina, "")).toBe(0);
    expect(await markReadByHref(irina, "/staff/appeals/00000000-0000-4000-8000-000000000000")).toBe(0);
    expect(await unreadCount(irina)).toBe(2);
  });
});

describe("listAllAnnouncements", () => {
  it("сотрудник видит все объявления, новые сверху, с подписью аудитории и автором", async () => {
    const list = await listAllAnnouncements(irina);
    expect(list.map((a) => [a.title, a.audience, a.important])).toEqual([
      ["ЭК-24-2: консультация по эконометрике", "ЭК-24-2", false],
      ["Зимняя сессия начинается 22 декабря", "Всем", true],
      ["Консультация по математическому анализу", "ФПМИ", false],
      ["Документы на производственную практику", "3 курс", false],
    ]);
    expect(list[0]).toMatchObject({ id: expect.any(Number), author: "Ирина Белова", publishedAt: expect.any(Date) });
    expect(list[0].body).toMatch(/^Виктор Степанович Морозов/);
  });

  it("не сотрудник (подделанный viewer) → пусто", async () => {
    expect(await listAllAnnouncements(alina as unknown as StaffViewer)).toEqual([]);
  });
});

describe("listAudienceOptions", () => {
  it("факультеты, курсы 1–6 и группы — справочник для формы объявления", async () => {
    const o = await listAudienceOptions();
    expect(o.faculties.map((f) => [f.code, f.name])).toEqual([
      ["ФПМИ", "Факультет прикладной математики и информатики"],
      ["ФЭУ", "Факультет экономики и управления"],
      ["ГФ", "Гуманитарный факультет"],
    ]);
    expect(o.courses).toEqual([1, 2, 3, 4, 5, 6]);
    expect(o.groups.map((g) => [g.name, g.course])).toEqual([
      ["ЛИН-26-1", 1], ["ПМИ-25-1", 2], ["ПМИ-25-2", 2], ["ЭК-24-1", 3], ["ЭК-24-2", 3],
    ]);
    const pmi = o.faculties.find((f) => f.code === "ФПМИ")!;
    expect(o.groups.find((g) => g.name === "ПМИ-25-1")).toEqual({
      id: expect.any(Number), name: "ПМИ-25-1", course: 2, facultyId: pmi.id,
    });
  });
});

describe("getStaffProfile", () => {
  it("ФИО, должность и отделы сотрудника", async () => {
    expect(await getStaffProfile(irina)).toEqual({
      fullName: "Белова Ирина Николаевна", firstName: "Ирина", lastName: "Белова", initials: "ИБ",
      position: "Специалист единого деканата",
      departments: ["Справки и документы", "Учебный отдел", "Стипендиальный отдел"],
    });
  });

  it("не сотрудник → null", async () => {
    expect(await getStaffProfile(alina as unknown as StaffViewer)).toBeNull();
  });
});

describe("createAnnouncement: сколько студентов получат", () => {
  it("группа ПМИ-25-1 — одна Алина; всем — все пять студентов демо-мира", async () => {
    const o = await listAudienceOptions();
    const pmi = o.groups.find((g) => g.name === "ПМИ-25-1")!;
    const forGroup = await createAnnouncement(irina, {
      title: "Консультация для ПМИ-25-1", body: "Встречаемся в четверг в 16:00, ауд. А-301.", important: false,
      audience: { groupId: pmi.id },
    }, TUE);
    expect(forGroup).toEqual({ ok: true, value: { id: expect.any(Number), recipients: 1 } });

    const forAll = await createAnnouncement(irina, {
      title: "Для всех студентов", body: "Единое окно в пятницу работает до 15:00.", important: true, audience: {},
    }, TUE);
    expect(forAll).toEqual({ ok: true, value: { id: expect.any(Number), recipients: 5 } });
  });
});
