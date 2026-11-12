import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { getQueueAppeal, listQueue } from "@/server/appeals/staff";
import { getMyAppeal, listMyAppeals } from "@/server/appeals/service";
import { listNotifications, markAllRead, unreadCount } from "@/server/notifications";
import {
  getSettings, profileCompletion, saveNameStress, saveNotifyMuted, saveStudyLanguage,
} from "@/server/settings";
import { closeTestDb, testSql } from "./helpers/db";

// Настройки профиля: ударения в ФИО, язык обучения, уведомления. Всё пишется только в свою запись.

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const TUE = new Date("2026-11-10T09:00:00Z"); // вторник, 12:00 МСК
const ACUTE = "́";

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

describe("Viewer несёт настройки показа", () => {
  it("по умолчанию ударения показываются, выключенных категорий нет", () => {
    expect(alina.showStress).toBe(true);
    expect(alina.notifyMuted).toEqual([]);
    expect(irina.showStress).toBe(true);
  });
});

describe("ударения в ФИО", () => {
  it("сохраняются только корректные индексы и только в свою запись", async () => {
    // Миронова Алина Сергеевна: о=3, и=2, е=4; для фамилии прислан мусор — он отбрасывается
    const saved = await saveNameStress(alina, { last: 0, first: 2, middle: 4, hack: 1 }, true);
    expect(saved).toEqual({ first: 2, middle: 4 });

    const rows = await testSql<{ login: string | null; name_stress: unknown }[]>`
      select u.login, st.name_stress from students st join users u on u.id = st.user_id
       where st.name_stress is not null and u.login is not null`;
    expect(rows).toEqual([{ login: "alina.mironova", name_stress: { first: 2, middle: 4 } }]);
  });

  it("сотрудник видит студента с ударениями в очереди и в карточке", async () => {
    await saveNameStress(alina, { last: 3, first: 2, middle: 4 }, true);
    const expected = `Миро${ACUTE}нова Али${ACUTE}на Серге${ACUTE}евна`;
    const queue = await listQueue(irina, "in_progress", undefined, TUE);
    const mine = queue.find((q) => q.student.fullName.includes("Али"));
    expect(mine?.student.fullName).toBe(expected);
    const card = await getQueueAppeal(irina, mine!.id, TUE);
    expect(card?.student.fullName).toBe(expected);
  });

  it("студент видит сотрудника с ударениями в своём обращении", async () => {
    await saveNameStress(irina, { last: 3, first: 2, middle: 5 }, true); // Бело́ва Ири́на Никола́евна
    const [appeal] = await listMyAppeals(alina, "active", TUE);
    const card = await getMyAppeal(alina, appeal.id, TUE);
    expect(card?.assignee).toBe(`Ири${ACUTE}на Никола${ACUTE}евна Бело${ACUTE}ва`);
    expect(card?.events.some((e) => e.actorName === `Ири${ACUTE}на Никола${ACUTE}евна Бело${ACUTE}ва`)).toBe(true);
  });

  it("зритель выключил ударения — видит имена без знаков, а его собственные ударения остаются", async () => {
    await saveNameStress(irina, { last: 3, first: 2, middle: 5 }, false);
    const fresh = (await viewerForUser(irina.userId)) as StaffViewer;
    expect(fresh.showStress).toBe(false);
    const queue = await listQueue(fresh, "in_progress", undefined, TUE);
    expect(queue.find((q) => q.student.fullName.startsWith("Миронова"))?.student.fullName).toBe("Миронова Алина Сергеевна");
    // Алина по-прежнему видит Ирину с ударениями: настройка показа — у зрителя
    const [appeal] = await listMyAppeals(alina, "active", TUE);
    expect((await getMyAppeal(alina, appeal.id, TUE))?.assignee).toContain(ACUTE);
    await saveNameStress(irina, {}, true);
  });

  it("пустой набор снимает ударения", async () => {
    await saveNameStress(alina, {}, true);
    const settings = await getSettings(alina);
    expect(settings.stress).toEqual({});
  });

  it("в демо-мире есть студент с расставленными ударениями — их видно в очереди без настройки", async () => {
    const queue = await listQueue(irina, "new", undefined, TUE);
    expect(queue.some((q) => q.student.fullName === `Соколо${ACUTE}ва Мила${ACUTE}на Андре${ACUTE}евна`)).toBe(true);
  });
});

describe("язык обучения", () => {
  it("сохраняется код из списка и только себе", async () => {
    expect(await saveStudyLanguage(alina, "de")).toBe(true);
    expect((await getSettings(alina)).language).toBe("de");
    expect((await getSettings(denis)).language).toBeNull();
  });

  it("неизвестный код и мусор не сохраняются", async () => {
    expect(await saveStudyLanguage(alina, "klingon")).toBe(false);
    expect(await saveStudyLanguage(alina, null)).toBe(false);
    expect(await saveStudyLanguage(alina, { code: "en" })).toBe(false);
    expect((await getSettings(alina)).language).toBe("de");
  });
});

describe("настройки уведомлений", () => {
  it("выключенная категория скрывает свои уведомления и не считается в колокольчике", async () => {
    const before = await listNotifications(denis);
    const schedule = before.filter((n) => n.kind === "schedule_change");
    expect(schedule.length).toBeGreaterThan(0);
    const unreadBefore = await unreadCount(denis);
    const unreadSchedule = schedule.filter((n) => !n.read).length;

    expect(await saveNotifyMuted(denis, ["schedule", "appeals", "нет такой", 5])).toEqual(["schedule"]);
    const muted = (await viewerForUser(denis.userId)) as StudentViewer;
    expect(muted.notifyMuted).toEqual(["schedule"]);

    const after = await listNotifications(muted);
    expect(after).toHaveLength(before.length - schedule.length);
    expect(after.some((n) => schedule.some((x) => x.id === n.id))).toBe(false);
    expect(await unreadCount(muted)).toBe(unreadBefore - unreadSchedule);
  });

  it("«прочитать всё» не трогает скрытые: включишь категорию обратно — они по-прежнему новые", async () => {
    const muted = (await viewerForUser(denis.userId)) as StudentViewer;
    await testSql`update notifications set read_at = null where user_id = ${denis.userId}`;
    const hidden = await testSql<{ n: number }[]>`
      select count(*)::int as n from notifications
       where user_id = ${denis.userId} and kind = 'schedule_change'`;
    await markAllRead(muted);
    await saveNotifyMuted(denis, []);
    const back = (await viewerForUser(denis.userId)) as StudentViewer;
    expect(await unreadCount(back)).toBe(hidden[0].n);
  });

  it("ответы деканата по обращениям выключить нельзя", async () => {
    expect(await saveNotifyMuted(alina, ["appeals"])).toEqual([]);
  });

  it("не массив — ничего не выключено", async () => {
    expect(await saveNotifyMuted(alina, "schedule")).toEqual([]);
    expect(await saveNotifyMuted(alina, null)).toEqual([]);
  });
});

describe("заполненность профиля", () => {
  it("считает почту, язык и ударения", async () => {
    await saveNameStress(denis, {}, true);
    const empty = profileCompletion(await getSettings(denis));
    expect(empty).toMatchObject({ done: 1, total: 3 });
    expect(empty.missing).toEqual(["language", "stress"]);

    await saveStudyLanguage(denis, "en");
    await saveNameStress(denis, { last: 5, first: 1, middle: 2 }, true); // Кравцо́в Де́нис Оле́гович (как решил сам)
    expect(profileCompletion(await getSettings(denis))).toMatchObject({ done: 3, total: 3, missing: [] });
  });
});
