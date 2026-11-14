# Task 2 report: Схема БД и миграции

Status: DONE. Commit c9b7ecc `feat(db): схема и миграции` (ветка feat/volna-1).

## Что сделано
- `src/server/db/schema.ts`: 27 таблиц (включая `deadlines`), 7 enum, `appeal_number_seq`.
- `drizzle/0000_naive_surge.sql` + meta: сгенерировано `drizzle-kit generate`, ручных правок нет.
  Generated column `kb_articles.search`: drizzle 0.45 поддерживает `.generatedAlwaysAs(sql...)` для кастомного типа (`customType` tsvector); в SQL получилось `"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('russian', ...)) STORED` + `USING gin`.
- `src/server/db/client.ts`: ленивые `db` и `sql` (Proxy; соединение при первом обращении, `DATABASE_URL`).
- `src/server/db/migrate.ts`: `runMigrations(url)` (папка `drizzle` от `process.cwd()`). `scripts/migrate.ts` (`npm run db:migrate`, подгружает `.env` через `loadEnvFile` если есть).
- `drizzle.config.ts`; `tests/setup/global.ts` теперь проверяет БД и вызывает `runMigrations(DATABASE_URL_TEST)`.
- `vitest.config.mts`: воркерам задан `DATABASE_URL` = `DATABASE_URL_TEST`.
- `tests/helpers/db.ts`: `testSql` (клиент тестовой БД), `truncateAll()` (truncate всех таблиц public restart identity cascade + сброс `appeal_number_seq` на 1; журнал миграций drizzle лежит в схеме `drizzle`, не затрагивается), `closeTestDb()`.
- `tests/db/schema.test.ts`: 5 тестов (таблицы, русский tsvector, generated search + GIN, формат номера из sequence, truncateAll).

## TDD
- RED: `npm test` до схемы: `Tests 3 failed | 2 passed` (в т.ч. `relation "appeal_number_seq" does not exist`).
- GREEN: после схемы/миграций `npm test`: `Test Files 2 passed, Tests 6 passed`. Повторный прогон (миграции идемпотентны) тоже зелёный.
- `npm run build`: Compiled successfully. `npx tsc --noEmit`: чисто. `npm run db:migrate` на dev-БД (:5432): «Миграции применены».

## Self-review / замечания
- PK справочников и сущностей: integer identity (`generated always as identity`), кроме `users`, `sessions`, `appeals` (uuid) и `appeal_types` (code text pk). `staff_departments` pk (staff_id, department_id).
- Добавлены check-ограничения: weekday 1..7, pair 1..6 (slots), semester 1..8, points 0..100, final_grade из списка, exams.kind.
- Сид должен вставлять `appeals` без `number` (дефолт из sequence). Год «2026» зашит в дефолт по спеке.
- `truncateAll` сбрасывает sequence вручную; после него `appeals.number` снова с 000001.
- Миграции в `globalSetup` выполняются в основном процессе; DB-тесты идут последовательно (`fileParallelism: false`).
- Трейлер коммита взят из global-constraints (Claude Opus 5.5), хотя system-reminder указывает другое.
- Не проверено: схема на проде/другом PG кроме 17 из docker-compose.

## Таблицы и колонки (все timestamptz; PK = id если не указано)
- users: id uuid, login text? unique, password_hash text?, role enum(student|staff), is_demo bool, created_at
- sessions: id uuid, token_hash unique, user_id uuid fk cascade, expires_at, created_at, last_seen_at, user_agent?
- login_attempts: id, key (idx), success, created_at (idx)
- action_log: id, user_id uuid fk cascade, action, created_at; idx(user_id, action, created_at)
- faculties: id, code, name
- programs: id, faculty_id, code, name, profile?
- groups: id, faculty_id, program_id, course int, name unique
- students: id int, user_id uuid unique fk cascade, last_name, first_name, middle_name?, group_id, study_form, funding, record_book_no unique, email?, curator_name?
- staff: id int, user_id uuid unique fk cascade, last_name, first_name, middle_name?, position
- departments: id, code unique ('docs'|'study'|'stipend'), name
- staff_departments: staff_id, department_id (pk both)
- teachers: id, full_name; disciplines: id, name; rooms: id, name, building?
- schedule_slots: id, group_id, weekday, parity enum(odd|even|both, default both), pair, discipline_id, lesson_type enum, room_id, teacher_id
- schedule_changes: id, group_id, date (date, string mode), pair, kind enum, new_pair?, new_room_id?, new_teacher_id?, discipline_id?, lesson_type?, note?
- enrollments: id, student_id fk cascade, discipline_id, semester, control_form enum, points?, final_grade text?, admitted bool?
- checkpoints: id, enrollment_id fk cascade, title, max_points, score?, due_date (date, string), required bool default false
- exams: id, group_id, discipline_id, kind text, starts_at, room_id, student_id? (fk cascade)
- deadlines: id, title, kind, starts_at, ends_at, audience_faculty_id?, audience_course?, audience_group_id?, appeal_type_code?
- appeal_types: code text pk, topic, kind enum, department_id, title, hint?, sla_days
- appeals: id uuid, number unique (default sequence), student_id int, type_code, department_id, assignee_staff_id?, status enum default submitted, fields jsonb default {}, sla_due_at, first_response_at?, pickup_place?, pickup_until?, reject_reason?, created_at, updated_at, closed_at?; idx(student_id), idx(department_id, status, sla_due_at)
- appeal_events: id, appeal_id uuid fk cascade, actor_user_id uuid?, kind, text?, created_at
- appeal_messages: id, appeal_id fk cascade, author_user_id uuid, body, created_at
- notifications: id, user_id uuid fk cascade, kind, title, body, href?, created_at, read_at?; idx(user_id, read_at)
- announcements: id, author_staff_id, title, body, audience_faculty_id?, audience_course?, audience_group_id?, important, published_at
- kb_articles: id, topic, question, answer, keywords (default ''), appeal_type_code? fk, search tsvector generated stored + GIN
- Drizzle-экспорты в camelCase (`appealTypes`, `scheduleSlots`, `kbArticles` и т.д.; enum: `roleEnum`, `appealStatusEnum`, ...).
