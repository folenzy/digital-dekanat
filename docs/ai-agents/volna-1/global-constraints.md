# Global constraints (verbatim from plan + spec) — bind every task

- Только вымышленные данные; вуз «Университет Ориентир», кабинет «На связи», подзаголовок «цифровой деканат».
- Пометка «Концепт для конкурса · не официальный сервис» видна на каждом экране и на странице входа.
- Мобильная ширина от 360 px без горизонтального скролла; десктоп от 1024 px.
- Часовой пояс бизнес-логики Europe/Moscow; любая функция, зависящая от времени, принимает `now: Date`.
- Пароли только argon2id; в БД хранится только хеш токена сессии (sha-256).
- Каждая функция чтения/записи данных студента берёт `studentId` из `Viewer`, а не из аргументов от клиента. Чужое → `null` → 404.
- Секреты только в env: `.env*` не читать, не выводить, не коммитить; `.env.example` в git.
- Шрифты self-host через @fontsource, только с кириллицей; всё стороннее перечисляется в `LICENSES.md`.
- Тексты интерфейса на русском, обращение к пользователю на «ты».
- Next.js 16: перед использованием API (proxy/middleware, server actions, cookies, instrumentation) сверяться с документацией в `node_modules/next/dist/docs/` (если есть), иначе nextjs.org/docs — не писать по памяти.
- Коммиты небольшие; каждое сообщение коммита заканчивается строкой `Co-Authored-By: Claude <ваша модель, например Sonnet 5.5 или Opus 5.5> <noreply@anthropic.com>` — указывай модель, которая реально писала код (для честного описания процесса). Не пушить. Не трогать ветку `main`.
- `docs/process/LOG.md` ведёт контроллер, исполнители его НЕ редактируют.

## Environment
- Windows 11; shells: PowerShell 5.1 and Git Bash. Node 24.16, npm 11. Docker 29 available. Python NOT installed.
- Repo root: C:\Users\ASUS\Downloads\digital-dekanat (branch feat/volna-1).
- Dev DB: docker compose -f docker-compose.dev.yml (db :5432 `nasvyazi`, db-test :5433 `nasvyazi_test`), user/password `nasvyazi`/`nasvyazi` (local only, not secret).
- For commit messages with non-ASCII text in PowerShell, write the message to a temp file and use `git commit -F <file>` (PowerShell 5.1 mangles here-strings passed to native exe).

## Cross-task rulings (from controller pre-flight)
- `users.login` nullable + unique; `password_hash` nullable (fictional students without login cannot sign in).
- `src/server/auth/password.ts` (`hashPassword`, `verifyPassword`) is created in Task 3, reused in Task 4.
- `src/server/appeals/types.ts` with full `APPEAL_TYPES` (incl. zod `fields`) is created in Task 3, consumed by Task 6.
- `src/server/realtime.ts` with real `publish(userIds, event)` via `pg_notify('ns_events', json)` is created in Task 6; Task 9 adds `subscribe`, SSE route and client.
- `requireStudent/requireStaff`: no cookie → `redirect('/login')`; cookie but no valid session → `redirect('/login?reason=expired')`; wrong role → `notFound()`.
- Service functions take `Viewer`/`now` args and are unit/integration-tested directly against the test DB; vitest aliases `server-only` to an empty module; cookie/`getViewer` paths are covered by Playwright e2e.
- Execution order: 1–9, 11, 12, 13, 14, 10, 15, 16, 17.
- Extra table `deadlines` (id, title, kind, starts_at, ends_at, audience_faculty_id?, audience_course?, audience_group_id?, appeal_type_code?) — holds windows like «приём заявлений на повышенную стипендию» and «Скоро дедлайны» items; nudges and the Today screen read it.
- DB tests share one helper (`tests/helpers/db.ts`) instead of creating a postgres() client per file.
- Group names (autumn 2026): Alina's group is **ПМИ-25-1** (course 2), Denis's group is **ЭК-24-2** (course 3). Where the plan text says ПМИ-24-1 / ЭК-23-2, use the new names (rename is done in Task 5).
- ID types: `users.id`, `sessions.id`, `appeals.id` are uuid strings; every other PK is an integer. So `Viewer.userId: string`, but `studentId`, `staffId`, `groupId`, `facultyId`, `departmentIds` are `number`. Plan text saying `string` for these is superseded. Auth API: see task-4-report.md (`src/server/auth/*`, `SESSION_COOKIE` in `src/server/auth/cookie.ts`, `loginAction(prevState, formData)` for `useActionState`).
- Average grade / «средний балл» counts numeric final grades only ('5','4','3','2'); 'зачёт'/'незачёт' are excluded; '2' and 'незачёт' are debts.
