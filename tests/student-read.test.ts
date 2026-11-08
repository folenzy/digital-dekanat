import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser, type StaffViewer, type StudentViewer } from "@/server/auth/viewer";
import { getProfile } from "@/server/profile";
import { getDay, getTodayOverview, getWeek } from "@/server/schedule";
import { getStudySummary, preliminaryGrade } from "@/server/grades";
import { listAnnouncementsFor } from "@/server/announcements";
import { listUpcomingDeadlines } from "@/server/deadlines";
import { listNotifications, markAllRead, markRead, unreadCount } from "@/server/notifications";
import { closeTestDb, testSql } from "./helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
// вторник 10 ноября 2026, 12:00 МСК; неделя 10 (нечётная)
const TUE = new Date("2026-11-10T09:00:00Z");

async function viewerOf(login: string) {
  const [u] = await testSql<{ id: string }[]>`select id from users where login = ${login}`;
  return (await viewerForUser(u.id))!;
}

let alina: StudentViewer;
let denis: StudentViewer;
let irina: StaffViewer;

async function loadViewers() {
  alina = (await viewerOf("alina.mironova")) as StudentViewer;
  denis = (await viewerOf("denis.kravtsov")) as StudentViewer;
  irina = (await viewerOf("irina.belova")) as StaffViewer;
}

afterAll(closeTestDb);

describe("профиль", () => {
  beforeAll(async () => { await buildDemoWorld(db, TUE, pw); await loadViewers(); });

  it("ФИО по частям, факультет, направление, группа, куратор", async () => {
    expect(await getProfile(alina)).toEqual({
      lastName: "Миронова", firstName: "Алина", middleName: "Сергеевна",
      fullName: "Миронова Алина Сергеевна", initials: "АМ",
      faculty: { code: "ФПМИ", name: "Факультет прикладной математики и информатики" },
      program: { code: "01.03.02", name: "Прикладная математика и информатика", profile: "Анализ данных и моделирование" },
      course: 2, group: "ПМИ-25-1", studyForm: "очная", funding: "бюджет",
      recordBookNo: "ОР-25-0137", email: "alina.mironova@orientir-uni.example",
      curatorName: "Ковалёва Марина Анатольевна",
    });
    expect(await getProfile(denis)).toMatchObject({ group: "ЭК-24-2", course: 3, funding: "договор" });
  });
});

describe("расписание", () => {
  beforeAll(async () => { await buildDemoWorld(db, TUE, pw); await loadViewers(); });

  it("вторник: шаблон + перенос аудитории (was.room) и отмена, отсортировано по паре", async () => {
    const day = await getDay(alina, TUE);
    expect(day.map((l) => l.pair)).toEqual([1, 2, 3]);
    expect(day[0]).toMatchObject({
      pair: 1, start: "09:00", end: "10:30", discipline: "Дискретная математика", type: "lecture",
      room: "А-310", building: "Корпус А", teacher: "Лебедев Сергей Павлович", cancelled: false,
      change: { kind: "room", was: { room: "А-301" } },
    });
    expect(day[0].change?.note).toContain("технические работы");
    expect(day[1]).toMatchObject({ pair: 2, room: "А-215", cancelled: false });
    expect(day[1].change).toBeUndefined();
    expect(day[2]).toMatchObject({ pair: 3, cancelled: true, change: { kind: "cancelled" } });
  });

  it("среда: замена преподавателя (was.teacher) и перенос пары (was.start)", async () => {
    const day = await getDay(alina, new Date("2026-11-11T09:00:00Z"));
    expect(day.map((l) => [l.pair, l.discipline])).toEqual([
      [1, "Базы данных"], [2, "Теория вероятностей"], [3, "Объектно-ориентированное программирование"],
    ]);
    expect(day[0]).toMatchObject({
      start: "09:00", end: "10:30", type: "lab", room: "Б-12", cancelled: false,
      change: { kind: "moved", was: { start: "14:20" } },
    });
    expect(day[0].change?.was?.room).toBeUndefined();
    expect(day[1]).toMatchObject({
      teacher: "Тимофеев Роман Александрович",
      change: { kind: "teacher", was: { teacher: "Фомина Татьяна Львовна" } },
    });
  });

  it("чётность: во вторник чётной недели нет пары 2 (practice odd)", async () => {
    // 17 ноября — чётная неделя, изменений нет
    const day = await getDay(alina, new Date("2026-11-17T09:00:00Z"));
    expect(day.map((l) => l.pair)).toEqual([1, 3]);
    expect(day.every((l) => !l.change && !l.cancelled)).toBe(true);
  });

  it("день определяется по Москве: 21:30Z уже следующие сутки", async () => {
    const lateMon = await getDay(alina, new Date("2026-11-09T21:30:00Z")); // вт 00:30 МСК
    expect(lateMon).toEqual(await getDay(alina, TUE));
    expect(await getDay(alina, new Date("2026-11-07T21:30:00Z"))).toEqual([]); // вс 8 ноября
  });

  it("неделя: пн–сб, чётность, суббота пустая", async () => {
    const week = await getWeek(alina, new Date("2026-11-12T09:00:00Z"));
    expect(week.parity).toBe("odd");
    expect(week.days.map((d) => d.dateKey)).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14",
    ]);
    expect(week.days[0].lessons.map((l) => l.pair)).toEqual([2, 3, 4]);
    expect(week.days[1].lessons[0].change?.was?.room).toBe("А-301");
    expect(week.days[5].lessons).toEqual([]);
    expect((await getWeek(alina, new Date("2026-11-16T09:00:00Z"))).parity).toBe("even");
    // воскресенье относится к прошедшей неделе
    expect((await getWeek(alina, new Date("2026-11-15T09:00:00Z"))).days[0].dateKey).toBe("2026-11-09");
  });

  it("у студента только расписание его группы", async () => {
    const day = await getDay(denis, TUE);
    expect(day.map((l) => l.discipline)).toEqual(["Эконометрика", "Эконометрика", "Корпоративное право"]);
  });

  it("сегодня: идущая пара; следующая пропускает отменённую и берёт среду", async () => {
    const ov = await getTodayOverview(alina, TUE); // 12:00, пара 2 (10:40–12:10)
    expect(ov.lessons).toHaveLength(3);
    expect(ov.current).toMatchObject({ pair: 2, discipline: "Дискретная математика", type: "practice" });
    expect(ov.next).toMatchObject({ dateKey: "2026-11-11", pair: 1, discipline: "Базы данных" });
  });

  it("до начала пар current нет, next — первая пара сегодня", async () => {
    const ov = await getTodayOverview(alina, new Date("2026-11-10T05:00:00Z")); // 08:00
    expect(ov.current).toBeUndefined();
    expect(ov.next).toMatchObject({ dateKey: "2026-11-10", pair: 1 });
  });

  it("отменённая пара не считается идущей", async () => {
    const ov = await getTodayOverview(alina, new Date("2026-11-10T10:00:00Z")); // 13:00, пара 3 отменена
    expect(ov.current).toBeUndefined();
    expect(ov.next?.dateKey).toBe("2026-11-11");
  });

  it("2026-11-09T21:30Z — уже вторник 10 ноября по Москве: пары вторника, next не раньше 10-го", async () => {
    const now = new Date("2026-11-09T21:30:00Z");
    const ov = await getTodayOverview(alina, now);
    expect(ov.lessons).toEqual(await getDay(alina, TUE));
    expect(ov.lessons.length).toBeGreaterThan(0);
    expect(ov.current).toBeUndefined();
    expect(ov.next?.dateKey).toBe("2026-11-10");
    expect(ov.next?.pair).toBe(1);
  });

  it("суббота: пар нет, next — вторая пара понедельника", async () => {
    const ov = await getTodayOverview(alina, new Date("2026-11-14T09:00:00Z"));
    expect(ov.lessons).toEqual([]);
    expect(ov.current).toBeUndefined();
    expect(ov.next).toMatchObject({ dateKey: "2026-11-16", pair: 2, discipline: "Математический анализ", type: "lecture" });
  });

  it("2026-11-07T21:30Z — уже воскресенье 8 ноября: next — понедельник 9-го", async () => {
    const ov = await getTodayOverview(alina, new Date("2026-11-07T21:30:00Z"));
    expect(ov.lessons).toEqual([]);
    expect(ov.next?.dateKey).toBe("2026-11-09");
  });
});

describe("успеваемость", () => {
  beforeEach(async () => { await buildDemoWorld(db, TUE, pw); await loadViewers(); });

  it("предварительная оценка по баллам", () => {
    expect(preliminaryGrade(null)).toBeNull();
    expect([100, 85].map(preliminaryGrade)).toEqual(["отлично", "отлично"]);
    expect([84, 70].map(preliminaryGrade)).toEqual(["хорошо", "хорошо"]);
    expect([69, 55].map(preliminaryGrade)).toEqual(["удовлетворительно", "удовлетворительно"]);
    expect([54, 0].map(preliminaryGrade)).toEqual(["неудовлетворительно", "неудовлетворительно"]);
  });

  it("Алина: всё хорошо, средний 4.8, текущий семестр 3, зачётка — семестр 2", async () => {
    const sum = await getStudySummary(alina, TUE);
    expect(sum.verdict).toBe("good");
    expect(sum.avgLastSession).toBe(4.8);
    expect(sum.debts).toEqual([]);
    expect(sum.risks).toEqual([]);
    expect(sum.current).toHaveLength(6);
    const matan = sum.current.find((e) => e.discipline === "Математический анализ")!;
    expect(matan).toMatchObject({
      controlForm: "exam", points: 35, admitted: true, pace: { grade: "отлично", score: 35, max: 40 },
    });
    expect(matan.checkpoints.map((c) => c.title)).toEqual(["Контрольная работа №1", "Коллоквиум", "Контрольная работа №2"]);
    expect(matan.checkpoints[0]).toMatchObject({ score: 18, maxPoints: 20, required: true });
    expect(sum.history.map((h) => h.semester)).toEqual([2]);
    expect(sum.history[0].entries).toHaveLength(5);
    expect(sum.history[0].average).toBe(4.8);
    expect(sum.session).toHaveLength(6);
    expect(sum.session[0]).toMatchObject({ discipline: "Математический анализ", kind: "exam", room: "А-301", individual: false });
  });

  it("Денис: долг по статистике с пересдачей, риск по лабораторной, средний по числовым", async () => {
    const sum = await getStudySummary(denis, TUE);
    expect(sum.verdict).toBe("debts");
    expect(sum.avgLastSession).toBe(3.25); // 4,2,3,4; «зачёт» не считается
    expect(sum.debts).toHaveLength(1);
    expect(sum.debts[0]).toMatchObject({ discipline: "Статистика", semester: 4, grade: "2" });
    expect(sum.debts[0].retake).toMatchObject({ kind: "retake", room: "А-218", individual: true });
    expect(sum.risks).toHaveLength(1);
    expect(sum.risks[0]).toMatchObject({
      discipline: "Эконометрика", title: "Лабораторная работа №3 (регрессионная модель)",
      dueDate: "2026-11-13", overdue: false,
    });
    // сессия: 6 групповых + индивидуальная пересдача, по времени; пересдача раньше всех
    expect(sum.session).toHaveLength(7);
    expect(sum.session[0]).toMatchObject({ kind: "retake", individual: true });
    expect(sum.session.map((e) => +e.startsAt)).toEqual([...sum.session.map((e) => +e.startsAt)].sort((a, b) => a - b));
    expect(sum.history[0].semester).toBe(4);
    expect(sum.history[0].average).toBe(3.25);
  });

  it("без долгов, но с риском → risks (Денис после пересдачи)", async () => {
    await testSql`update enrollments set final_grade = '3' where final_grade = '2'`;
    expect((await getStudySummary(denis, TUE)).verdict).toBe("risks");
  });

  it("просроченная обязательная точка без баллов — риск с overdue", async () => {
    await testSql`update checkpoints set score = null where title = 'Коллоквиум'`;
    const sum = await getStudySummary(alina, TUE);
    expect(sum.verdict).toBe("risks");
    expect(sum.risks).toHaveLength(1);
    expect(sum.risks[0]).toMatchObject({ title: "Коллоквиум", overdue: true });
  });

  it("точка со сроком дальше чем через 7 дней риском не считается", async () => {
    await testSql`update checkpoints set required = true where title = 'Контрольная работа №2' and enrollment_id in
      (select id from enrollments where semester = 3)`;
    expect((await getStudySummary(alina, TUE)).verdict).toBe("good");
  });
});

describe("объявления и дедлайны", () => {
  beforeAll(async () => { await buildDemoWorld(db, TUE, pw); await loadViewers(); });

  it("Алина видит всем и своему факультету; объявление ЭК-24-2 не видит", async () => {
    const list = await listAnnouncementsFor(alina);
    expect(list.map((a) => a.title)).toEqual(["Зимняя сессия начинается 22 декабря", "Консультация по математическому анализу"]);
    expect(list[0]).toMatchObject({ important: true, audience: "Всем" });
    expect(list[1].audience).toBe("ФПМИ");
  });

  it("Денис: важные первыми, потом новые; курс и группа", async () => {
    const list = await listAnnouncementsFor(denis);
    expect(list.map((a) => a.audience)).toEqual(["Всем", "ЭК-24-2", "3 курс"]);
    expect(list[1].title).toBe("ЭК-24-2: консультация по эконометрике");
  });

  it("дедлайны Алины: по аудитории, по сроку", async () => {
    const list = await listUpcomingDeadlines(alina, TUE);
    expect(list.map((d) => [d.kind, d.title])).toEqual([
      ["deadline", "Обновление справок для социальной стипендии"],
      ["deadline", "Запись на элективные дисциплины следующего семестра"],
      ["deadline", "Приём заявлений на повышенную академическую стипендию"],
    ]);
    expect(list[2].href).toBe("/dekanat/new?type=stip_increased");
    expect(list[0].due).toEqual(new Date("2026-11-15T17:00:00+03:00"));
  });

  it("дедлайны Дениса: контрольная точка вперемешку с окнами, без чужого факультета", async () => {
    const list = await listUpcomingDeadlines(denis, TUE);
    expect(list.map((d) => d.title)).toEqual([
      "Эконометрика: Лабораторная работа №3 (регрессионная модель)",
      "Обновление справок для социальной стипендии",
      "Выбор темы курсовой работы",
      "Приём заявлений на повышенную академическую стипендию",
    ]);
    expect(list[0]).toMatchObject({ kind: "checkpoint", href: "/study" });
    expect(list.map((d) => +d.due)).toEqual([...list.map((d) => +d.due)].sort((a, b) => a - b));
  });

  it("days сужает окно контрольных точек", async () => {
    const list = await listUpcomingDeadlines(denis, TUE, 2); // точка со сроком 13 ноября не попадает
    expect(list.map((d) => d.kind)).toEqual(["deadline", "deadline", "deadline"]);
  });
});

describe("уведомления", () => {
  beforeEach(async () => { await buildDemoWorld(db, TUE, pw); await loadViewers(); });

  it("список новые → старые, счётчик, фильтр непрочитанных", async () => {
    const all = await listNotifications(alina, {});
    expect(all).toHaveLength(5);
    expect(all.map((n) => +n.createdAt)).toEqual([...all.map((n) => +n.createdAt)].sort((a, b) => b - a));
    expect(all.filter((n) => n.read)).toHaveLength(1);
    expect(await unreadCount(alina)).toBe(4);
    expect(await listNotifications(alina, { unreadOnly: true })).toHaveLength(4);
  });

  it("сотрудник видит только свои уведомления", async () => {
    const list = await listNotifications(irina, {});
    expect(list.map((n) => n.kind)).toEqual(["appeal_new", "appeal_new"]);
    expect(await unreadCount(irina)).toBe(2);
  });

  it("markRead: свой — true и счётчик падает, повторно — true без смены read_at; нет такого — false", async () => {
    const [first] = await listNotifications(alina, { unreadOnly: true });
    expect(await markRead(alina, first.id)).toBe(true);
    expect(await unreadCount(alina)).toBe(3);
    const [{ read_at }] = await testSql<{ read_at: Date }[]>`select read_at from notifications where id = ${first.id}`;
    expect(await markRead(alina, first.id)).toBe(true);
    const [again] = await testSql<{ read_at: Date }[]>`select read_at from notifications where id = ${first.id}`;
    expect(+again.read_at).toBe(+read_at);
    expect(await markRead(alina, 999_999)).toBe(false);
  });

  it("markAllRead: все свои прочитаны, возвращает сколько изменено", async () => {
    expect(await markAllRead(alina)).toBe(4);
    expect(await unreadCount(alina)).toBe(0);
    expect(await markAllRead(alina)).toBe(0);
  });
});
