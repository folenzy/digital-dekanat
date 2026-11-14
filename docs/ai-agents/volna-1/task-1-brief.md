### Task 1: Каркас проекта и тестовая инфраструктура

**Files:**
- Create: проект через `npx create-next-app@16.4.5 . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm` (в существующей папке; если откажется из-за файлов, создать во временной подпапке и перенести, не затирая `docs/`, `prompts/`, `CLAUDE.md`, `.gitignore`, `.gitattributes`)
- Create: `docker-compose.dev.yml`, `.env.example`, `vitest.config.ts`, `tests/setup/global.ts`, `tests/smoke.test.ts`, `playwright.config.ts`
- Modify: `package.json` (scripts), `next.config.ts` (`output: 'standalone'`, `poweredByHeader: false`), `CLAUDE.md` (раздел «Команды»)

**Interfaces:**
- Produces: скрипты `npm run dev | build | test | test:e2e | db:up | db:generate | db:migrate | demo:reset`. Env: `DATABASE_URL`, `DATABASE_URL_TEST`, `DEMO_PASSWORD_ALINA`, `DEMO_PASSWORD_DENIS`, `DEMO_PASSWORD_IRINA`, `DEMO_RESET_TOKEN`, `APP_ORIGIN`, `COOKIE_SECURE`.

- [ ] **Step 1:** Создать каркас и поставить зависимости из Tech Stack (dev: drizzle-kit, vitest, @playwright/test, @axe-core/playwright, tsx). Сверить, какие файлы-соглашения у Next 16 (`proxy.ts` против `middleware.ts`, `instrumentation.ts`), по `node_modules/next/dist/docs` и записать в `CLAUDE.md`.
- [ ] **Step 2:** `docker-compose.dev.yml`: `postgres:17-alpine` → `db` на 5432 (база `nasvyazi`) и `db-test` на 5433 (база `nasvyazi_test`, tmpfs).
- [ ] **Step 3:** Написать `tests/smoke.test.ts`: подключается к `DATABASE_URL_TEST`, `select 1` → 1. Vitest: `fileParallelism: false`, `globalSetup` применяет миграции к тестовой БД (после Task 2).
- [ ] **Step 4:** Run: `npm run db:up; npm test` → Expected: 1 passed. Run: `npm run build` → Expected: успешная сборка.
- [ ] **Step 5:** Commit `chore: каркас Next.js, docker для БД, vitest и playwright`.

