### Task 10: Защитный слой запросов

**Files:**
- Create/Modify: `src/proxy.ts` (или `middleware.ts` по докам Next 16), `next.config.ts`
- Test: `e2e/security-headers.spec.ts`

**Interfaces:**
- На каждый ответ: CSP с nonce (`default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`; HSTS выставляет Caddy в проде.
- Без cookie сессии все страницы, кроме `/login`, `/about`, `/api/health`, `/api/internal/*`, ведут на `/login` (это удобство; настоящая проверка — `requireStudent`/`requireStaff` в каждом layout и action).
- Студент на `/staff/*` → 404.

- [ ] **Step 1:** e2e-тест: заголовки есть на `/login`; аноним на `/schedule` → `/login`; студент на `/staff` → 404.
- [ ] **Step 2:** Run `npm run test:e2e -- security-headers` → FAIL. Реализовать. Run → PASS. Консоль браузера без ошибок CSP. Commit `feat(security): CSP, заголовки, редиректы`.

