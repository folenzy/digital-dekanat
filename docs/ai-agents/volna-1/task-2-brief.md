### Task 2: Схема БД и миграции

**Files:**
- Create: `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/server/db/migrate.ts`, `drizzle.config.ts`, `drizzle/` (сгенерированные миграции)
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: таблицы из спеки §8 с именами `users, sessions, login_attempts, action_log, faculties, programs, groups, students, staff, departments, staff_departments, teachers, disciplines, rooms, schedule_slots, schedule_changes, enrollments, checkpoints, exams, appeal_types, appeals, appeal_events, appeal_messages, notifications (с read_at), announcements, kb_articles`. `db` — экземпляр drizzle (`postgres-js`); `runMigrations(url: string): Promise<void>`.
- Enums: `role: 'student'|'staff'`; `appeal_status: 'submitted'|'in_progress'|'needs_info'|'ready'|'rejected'|'closed'`; `appeal_kind: 'certificate'|'application'|'question'`; `lesson_type: 'lecture'|'practice'|'lab'`; `change_kind: 'moved'|'cancelled'|'teacher'|'room'|'extra'`; `control_form: 'exam'|'credit'|'graded_credit'`; `week_parity: 'odd'|'even'|'both'`.
- `appeals.number` — человекочитаемый номер `О-2026-000123` из sequence `appeal_number_seq`. `appeals.id` — uuid (`gen_random_uuid()`). `action_log(user_id, action, created_at)` — для частотных лимитов.
- `kb_articles.search` — generated tsvector `to_tsvector('russian', question || ' ' || keywords || ' ' || answer)` + GIN-индекс.

- [ ] **Step 1:** Тест `schema.test.ts`: после миграций в `information_schema.tables` есть все перечисленные таблицы; `select to_tsvector('russian','справки')` не падает.
- [ ] **Step 2:** Run `npm test` → FAIL (нет таблиц).
- [ ] **Step 3:** Описать схему, `npm run db:generate`, подключить `runMigrations` в `globalSetup`.
- [ ] **Step 4:** Run `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(db): схема и миграции`.

