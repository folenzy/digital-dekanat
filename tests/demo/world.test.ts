import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { APPEAL_TYPES } from "@/server/appeals/types";
import { addWorkingDays, mskDateKey, mskWeekday } from "@/server/time";
import { closeTestDb, testSql, truncateAll } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
// вторник 10 ноября 2026, 12:00 МСК
const now = new Date("2026-11-10T09:00:00Z");

async function studentByLogin(login: string) {
  const [row] = await testSql<{ id: number; user_id: string; group_id: number; faculty_id: number }[]>`
    select st.id, st.user_id, st.group_id, g.faculty_id from students st
    join users u on u.id = st.user_id join groups g on g.id = st.group_id where u.login = ${login}`;
  return row;
}

describe("buildDemoWorld", () => {
  beforeEach(async () => {
    await truncateAll();
    await buildDemoWorld(db, now, pw);
  });
  afterAll(closeTestDb);

  it("создаёт ровно 3 пользователей с логином, пароли — argon2id", async () => {
    const users = await db.select().from(s.users);
    const withLogin = users.filter((u) => u.login);
    expect(withLogin.map((u) => u.login).sort()).toEqual(["alina.mironova", "denis.kravtsov", "irina.belova"]);
    for (const u of withLogin) {
      expect(u.passwordHash).toMatch(/^\$argon2id\$/);
      expect(Object.values(pw)).not.toContain(u.passwordHash);
    }
    for (const u of users.filter((x) => !x.login)) expect(u.passwordHash).toBeNull();
  });

  it("у Алины и Дениса разные факультеты и курсы", async () => {
    const a = await studentByLogin("alina.mironova");
    const d = await studentByLogin("denis.kravtsov");
    expect(a.faculty_id).not.toBe(d.faculty_id);
    const g = await db.select().from(s.groups);
    expect(g.find((x) => x.id === a.group_id)).toMatchObject({ name: "ПМИ-25-1", course: 2 });
    expect(g.find((x) => x.id === d.group_id)).toMatchObject({ name: "ЭК-24-2", course: 3 });
  });

  it("есть изменения расписания на сегодня для обеих групп (минимум отмена и смена аудитории)", async () => {
    const today = mskDateKey(now);
    const a = await studentByLogin("alina.mironova");
    const d = await studentByLogin("denis.kravtsov");
    for (const groupId of [a.group_id, d.group_id]) {
      const rows = await db.select().from(s.scheduleChanges).where(eq(s.scheduleChanges.groupId, groupId));
      const todays = rows.filter((r) => r.date === today);
      expect(todays.map((r) => r.kind)).toEqual(expect.arrayContaining(["room", "cancelled"]));
      expect(rows.some((r) => r.date !== today)).toBe(true);
    }
  });

  it("изменения расписания приходятся на пару, которая реально есть в шаблоне", async () => {
    const changes = await db.select().from(s.scheduleChanges);
    const slots = await db.select().from(s.scheduleSlots);
    for (const c of changes) {
      const wd = mskWeekday(new Date(`${c.date}T09:00:00Z`));
      expect(slots.some((x) => x.groupId === c.groupId && x.weekday === wd && x.pair === c.pair)).toBe(true);
    }
  });

  it("в выходной изменения переезжают на ближайшие рабочие дни", async () => {
    await truncateAll();
    const saturday = new Date("2026-11-07T09:00:00Z");
    await buildDemoWorld(db, saturday, pw);
    const dates = [...new Set((await db.select().from(s.scheduleChanges)).map((c) => c.date))].sort();
    expect(dates).toEqual(["2026-11-09", "2026-11-10"]);
  });

  it("активное обращение Алины: в работе у Ирины, срок в будущем", async () => {
    const a = await studentByLogin("alina.mironova");
    const [ap] = await db.select().from(s.appeals).where(eq(s.appeals.studentId, a.id));
    expect(ap).toMatchObject({ typeCode: "cert_military", status: "in_progress" });
    expect(ap.assigneeStaffId).not.toBeNull();
    expect(ap.slaDueAt.getTime()).toBeGreaterThan(now.getTime());
    expect(ap.slaDueAt).toEqual(addWorkingDays(ap.createdAt, 1));
    const events = await db.select().from(s.appealEvents).where(eq(s.appealEvents.appealId, ap.id));
    expect(events.map((e) => e.kind).sort()).toEqual(["submitted", "taken"]);
  });

  it("обращения Дениса: нужно уточнение (с вопросом) и справка готова", async () => {
    const d = await studentByLogin("denis.kravtsov");
    const rows = await db.select().from(s.appeals).where(eq(s.appeals.studentId, d.id));
    const retake = rows.find((r) => r.typeCode === "study_retake")!;
    const cert = rows.find((r) => r.typeCode === "cert_study")!;
    expect(retake.status).toBe("needs_info");
    const msgs = await db.select().from(s.appealMessages).where(eq(s.appealMessages.appealId, retake.id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("?");
    expect(msgs[0].authorUserId).not.toBe(d.user_id);
    expect(cert.status).toBe("ready");
    expect(cert.pickupPlace).toBe("каб. 214, корпус А");
    expect(mskDateKey(cert.pickupUntil!)).toBe("2026-11-16"); // today+5 = воскресенье, переносим на пн
  });

  it("в очереди Ирины 3 новых обращения от студентов без логина, каждому — уведомление Ирине", async () => {
    const rows = await testSql<{ type_code: string; login: string | null; status: string }[]>`
      select a.type_code, u.login, a.status from appeals a
      join students st on st.id = a.student_id join users u on u.id = st.user_id
      where a.status = 'submitted' order by a.type_code`;
    expect(rows.map((r) => r.type_code)).toEqual(["stip_payment_question", "study_individual_plan", "study_other"]);
    expect(rows.every((r) => r.login === null)).toBe(true);
    const depts = await testSql<{ code: string }[]>`
      select d.code from appeals a join departments d on d.id = a.department_id where a.status = 'submitted' order by d.code`;
    expect(depts.map((x) => x.code)).toEqual(["stipend", "study", "study"]);
    const notes = await testSql<{ href: string }[]>`
      select n.href from notifications n join users u on u.id = n.user_id
      where u.login = 'irina.belova' and n.kind = 'appeal_new' and n.read_at is null`;
    const ids = await testSql<{ id: string }[]>`select id from appeals where status = 'submitted'`;
    expect(notes.map((n) => n.href).sort()).toEqual(ids.map((a) => `/staff/appeals/${a.id}`).sort());
  });

  it("ровно одно просроченное обращение — в будний день, в выходной и рано утром в понедельник", async () => {
    const overdueAt = async (at: Date) => {
      await truncateAll();
      await buildDemoWorld(db, at, pw);
      const rows = await testSql<{ type_code: string; last_name: string; sla_due_at: string; created_at: string }[]>`
        select a.type_code, st.last_name, a.sla_due_at, a.created_at from appeals a
        join students st on st.id = a.student_id
        where a.status in ('submitted', 'in_progress') and a.sla_due_at < ${at.toISOString()}::timestamptz`;
      // этот клиент отдаёт timestamptz строкой
      return rows.map((r) => ({ ...r, sla_due_at: new Date(r.sla_due_at), created_at: new Date(r.created_at) }));
    };
    for (const at of [
      now,                                   // вторник, 12:00 МСК
      new Date("2026-11-08T09:00:00Z"),      // воскресенье, 12:00 МСК
      new Date("2026-11-08T21:30:00Z"),      // понедельник, 00:30 МСК
      new Date("2026-11-13T14:59:00Z"),      // пятница, 17:59 МСК — за минуту до конца рабочего дня
    ]) {
      const rows = await overdueAt(at);
      expect(rows, at.toISOString()).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type_code: "study_other", last_name: "Захаров" });
      // срок — 18:00 предыдущего рабочего дня; отправлено за (срок + 1) рабочих дня
      expect(rows[0].sla_due_at).toEqual(addWorkingDays(rows[0].created_at, APPEAL_TYPES.study_other.slaDays));
      expect(mskDateKey(rows[0].sla_due_at) < mskDateKey(at)).toBe(true);
    }
  });

  it("Ирина состоит во всех трёх отделах", async () => {
    const rows = await testSql<{ code: string }[]>`
      select d.code from staff_departments sd join departments d on d.id = sd.department_id order by d.code`;
    expect(rows.map((r) => r.code)).toEqual(["docs", "stipend", "study"]);
  });

  it("appeal_types заполнены из APPEAL_TYPES", async () => {
    const rows = await db.select().from(s.appealTypes);
    expect(rows.map((r) => r.code).sort()).toEqual(Object.keys(APPEAL_TYPES).sort());
  });

  it("Алина: прошлая сессия на отлично, долгов нет", async () => {
    const a = await studentByLogin("alina.mironova");
    const last = await db.select().from(s.enrollments).where(eq(s.enrollments.studentId, a.id));
    const prev = last.filter((e) => e.semester === 2);
    expect(prev).toHaveLength(5);
    const grades = prev.map((e) => Number(e.finalGrade));
    expect(grades.reduce((x, y) => x + y, 0) / grades.length).toBeGreaterThanOrEqual(4.5);
    expect(last.some((e) => e.finalGrade === "2" || e.finalGrade === "незачёт")).toBe(false);
    const current = last.filter((e) => e.semester === 3);
    expect(current.length).toBeGreaterThanOrEqual(5);
    expect(current.every((e) => e.points !== null)).toBe(true);
  });

  it("Денис: неуд в прошлой сессии, пересдача через 5–10 дней, обязательная точка через 3 дня", async () => {
    const d = await studentByLogin("denis.kravtsov");
    const enr = await db.select().from(s.enrollments).where(eq(s.enrollments.studentId, d.id));
    expect(enr.filter((e) => e.semester === 4 && e.finalGrade === "2")).toHaveLength(1);
    const retakes = await db.select().from(s.exams).where(eq(s.exams.studentId, d.id));
    expect(retakes).toHaveLength(1);
    expect(retakes[0].kind).toBe("retake");
    const days = (retakes[0].startsAt.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(5);
    expect(days).toBeLessThanOrEqual(10);
    const cps = await testSql<{ due_date: string; score: number | null; required: boolean }[]>`
      select c.due_date::text, c.score, c.required from checkpoints c
      join enrollments e on e.id = c.enrollment_id where e.student_id = ${d.id} and c.required and c.score is null`;
    expect(cps).toHaveLength(1);
    expect(cps[0].due_date).toBe("2026-11-13");
  });

  it("экзамены сессии начинаются 22 декабря 2026", async () => {
    const group = await db.select().from(s.exams);
    const sessionExams = group.filter((e) => e.kind !== "retake");
    expect(sessionExams.length).toBeGreaterThanOrEqual(8);
    const min = Math.min(...sessionExams.map((e) => e.startsAt.getTime()));
    expect(mskDateKey(new Date(min))).toBe("2026-12-22");
  });

  it("окно приёма на повышенную стипендию — [сегодня-7, сегодня+14], плюс другие дедлайны", async () => {
    const rows = await db.select().from(s.deadlines);
    const win = rows.find((r) => r.appealTypeCode === "stip_increased")!;
    expect(mskDateKey(win.startsAt)).toBe("2026-11-03");
    expect(mskDateKey(win.endsAt)).toBe("2026-11-24");
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it("4 объявления (1 важное), 25 статей базы, 3–5 уведомлений на студента", async () => {
    const ann = await db.select().from(s.announcements);
    expect(ann).toHaveLength(4);
    expect(ann.filter((x) => x.important)).toHaveLength(1);
    const kb = await db.select().from(s.kbArticles);
    expect(kb).toHaveLength(25);
    expect(new Set(kb.map((k) => k.topic))).toEqual(new Set(["certificates", "study", "stipend"]));
    for (const login of ["alina.mironova", "denis.kravtsov"]) {
      const st = await studentByLogin(login);
      const n = await db.select().from(s.notifications).where(eq(s.notifications.userId, st.user_id));
      expect(n.length).toBeGreaterThanOrEqual(3);
      expect(n.length).toBeLessThanOrEqual(5);
    }
  });

  it("поиск по базе находит ключевые статьи", async () => {
    const q = async (text: string) =>
      testSql<{ appeal_type_code: string | null }[]>`
        select appeal_type_code from kb_articles
        where search @@ websearch_to_tsquery('russian', ${text})
        order by ts_rank(search, websearch_to_tsquery('russian', ${text})) desc`;
    expect((await q("справка в военкомат"))[0]?.appeal_type_code).toBe("cert_military");
    expect((await q("повышенная стипендия"))[0]?.appeal_type_code).toBe("stip_increased");
    expect((await q("пересдать экзамен"))[0]?.appeal_type_code).toBe("study_retake");
  });

  it("номера обращений начинаются с О-2026-000001 (sequence сброшена)", async () => {
    const rows = await testSql<{ number: string }[]>`select number from appeals order by number limit 1`;
    expect(rows[0].number).toBe("О-2026-000001");
  });

  it("повторная сборка удаляет обращение «пользователя», все сессии и попытки входа", async () => {
    const a = await studentByLogin("alina.mironova");
    await testSql`insert into appeals (student_id, type_code, department_id, sla_due_at, fields)
      select ${a.id}, 'cert_study', d.id, now(), '{"destination":"тест","copies":1,"format":"paper"}'::jsonb
      from departments d where d.code = 'docs'`;
    await testSql`insert into sessions (token_hash, user_id, expires_at) values ('abc', ${a.user_id}, now() + interval '1 day')`;
    await testSql`insert into login_attempts (key, success) values ('x', false)`;
    const before = await testSql`select 1 from appeals`;
    await buildDemoWorld(db, now, pw);
    const after = await testSql`select 1 from appeals`;
    expect(after.length).toBe(before.length - 1);
    expect(await testSql`select 1 from sessions`).toHaveLength(0);
    expect(await testSql`select 1 from login_attempts`).toHaveLength(0);
    const [{ n }] = await testSql<{ n: string }[]>`select min(number) n from appeals`;
    expect(n).toBe("О-2026-000001");
  });
});
