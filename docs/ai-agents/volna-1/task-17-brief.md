### Task 17: Security review, README, лицензии, документы для жюри

**Скиллы:** `security-review`, затем `superpowers:verification-before-completion`.

**Files:** `README.md`, `LICENSES.md`, `docs/process/SECURITY-REVIEW.md`, `docs/process/LOG.md`, `docs/process/TOOLS.md`, `docs/process/DESCRIPTION.md` (черновик со структурой из ТЗ), `prompts/01-…` (ключевые промпты этапов)

- [ ] **Step 1:** Запустить `security-review`; каждую находку исправить (с тестом) или описать, почему она не применима, в `SECURITY-REVIEW.md`.
- [ ] **Step 2:** `README.md`: что это (концепт для конкурса), ссылка (после деплоя), тестовые аккаунты (логины и пароли), ночной сброс, как запустить локально, тесты, структура. `LICENSES.md`: все зависимости из `npm ls --omit=dev --depth=0` с лицензиями + шрифты (OFL-1.1) + Lucide (ISC).
- [ ] **Step 3:** Прогнать всё: `npm test`, `npm run test:e2e`, `npm run build`, локальный compose. Показать вывод. Заполнить чек-лист из мастер-промпта §8 реальными результатами.
- [ ] **Step 4:** Commit `docs: security review, README, лицензии, журнал`.
