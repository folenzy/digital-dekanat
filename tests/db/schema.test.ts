import { afterAll, expect, test } from "vitest";
import { closeTestDb, testSql } from "../helpers/db";

afterAll(closeTestDb);

const TABLES = [
  "users", "sessions", "login_attempts", "action_log", "faculties", "programs", "groups",
  "students", "staff", "departments", "staff_departments", "teachers", "disciplines", "rooms",
  "schedule_slots", "schedule_changes", "enrollments", "checkpoints", "exams", "deadlines",
  "appeal_types", "appeals", "appeal_events", "appeal_messages", "notifications",
  "announcements", "kb_articles",
];

test("после миграций есть все таблицы", async () => {
  const rows = await testSql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public'`;
  const have = new Set(rows.map((r) => r.table_name));
  expect(TABLES.filter((t) => !have.has(t))).toEqual([]);
});

test("русский tsvector работает", async () => {
  const r = await testSql`select to_tsvector('russian','справки') as v`;
  expect(String(r[0].v)).toContain("справк");
});

test("kb_articles.search генерируется и имеет GIN-индекс", async () => {
  await testSql`insert into kb_articles (topic, question, answer, keywords)
    values ('Справки', 'Как заказать справку?', 'Через раздел обращений', 'справка заказ')`;
  const r = await testSql`select count(*)::int as n from kb_articles
    where search @@ websearch_to_tsquery('russian', 'справки')`;
  expect(r[0].n).toBe(1);
  const idx = await testSql`select indexdef from pg_indexes where tablename='kb_articles' and indexdef ilike '%gin%'`;
  expect(idx.length).toBe(1);
  await testSql`delete from kb_articles`;
});

test("номер обращения берётся из appeal_number_seq", async () => {
  const [n] = await testSql`select 'О-2026-' || lpad(nextval('appeal_number_seq')::text, 6, '0') as v`;
  expect(String(n.v)).toMatch(/^О-2026-\d{6}$/);
});

test("truncateAll очищает таблицы и сбрасывает sequence", async () => {
  const { truncateAll } = await import("../helpers/db");
  await testSql`insert into faculties (code, name) values ('X', 'Тест')`;
  await testSql`select nextval('appeal_number_seq')`;
  await truncateAll();
  expect((await testSql`select count(*)::int as n from faculties`)[0].n).toBe(0);
  expect(Number((await testSql`select nextval('appeal_number_seq') as v`)[0].v)).toBe(1);
  await truncateAll();
});
