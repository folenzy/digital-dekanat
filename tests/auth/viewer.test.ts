import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "@/server/db/schema";
import { buildDemoWorld } from "@/server/demo/world";
import { viewerForUser } from "@/server/auth/viewer";
import { closeTestDb, testSql } from "../helpers/db";

const db = drizzle(testSql, { schema: s });
const pw = { alina: "Test-Alina-pass-1", denis: "Test-Denis-pass-1", irina: "Test-Irina-pass-1" };
const now = new Date("2026-11-10T09:00:00Z");

async function studentRow(login: string) {
  const [row] = await testSql<{ user_id: string; id: number; group_id: number; faculty_id: number; course: number }[]>`
    select st.user_id, st.id, st.group_id, g.faculty_id, g.course from students st
    join users u on u.id = st.user_id join groups g on g.id = st.group_id where u.login = ${login}`;
  return row;
}

describe("viewerForUser", () => {
  beforeAll(() => buildDemoWorld(db, now, pw));
  afterAll(closeTestDb);

  it("студент: свои studentId, группа, факультет и курс", async () => {
    for (const login of ["alina.mironova", "denis.kravtsov"]) {
      const r = await studentRow(login);
      expect(await viewerForUser(r.user_id)).toEqual({
        userId: r.user_id, role: "student", studentId: r.id, groupId: r.group_id,
        facultyId: r.faculty_id, course: r.course,
        showStress: true, notifyMuted: [], // настройки показа по умолчанию
      });
    }
    const alina = await viewerForUser((await studentRow("alina.mironova")).user_id);
    const denis = await viewerForUser((await studentRow("denis.kravtsov")).user_id);
    expect(alina).toMatchObject({ course: 2 });
    expect(denis).toMatchObject({ course: 3 });
  });

  it("сотрудник: staffId и все его отделы", async () => {
    const [irina] = await testSql<{ user_id: string; id: number }[]>`
      select sf.user_id, sf.id from staff sf join users u on u.id = sf.user_id where u.login = 'irina.belova'`;
    const deps = await testSql<{ id: number }[]>`select id from departments order by id`;
    expect(deps).toHaveLength(3);
    expect(await viewerForUser(irina.user_id)).toEqual({
      userId: irina.user_id, role: "staff", staffId: irina.id, departmentIds: deps.map((d) => d.id),
      showStress: true, notifyMuted: [],
    });
  });

  it("неизвестный пользователь — null", async () => {
    expect(await viewerForUser("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("пользователь с ролью без профиля — null", async () => {
    const [u] = await testSql<{ id: string }[]>`
      insert into users (login, role) values ('test.orphan', 'staff') returning id`;
    const [v] = await testSql<{ id: string }[]>`
      insert into users (login, role) values ('test.orphan2', 'student') returning id`;
    try {
      expect(await viewerForUser(u.id)).toBeNull();
      expect(await viewerForUser(v.id)).toBeNull();
    } finally {
      await testSql`delete from users where id in (${u.id}, ${v.id})`;
    }
  });
});
