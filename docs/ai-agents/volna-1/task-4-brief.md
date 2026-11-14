### Task 4: Аутентификация, сессии, лимит попыток

**Files:**
- Create: `src/server/auth/password.ts`, `session.ts`, `rate-limit.ts`, `viewer.ts`, `login.ts`, `src/app/(auth)/login/actions.ts`
- Test: `tests/auth/*.test.ts`

**Interfaces:**
- `hashPassword(p): Promise<string>`, `verifyPassword(hash, p): Promise<boolean>` (argon2id, параметры по умолчанию @node-rs/argon2).
- `createSession(userId, userAgent?): Promise<{token: string; expiresAt: Date}>` — 32 случайных байта (base64url), в БД sha-256; срок 7 дней. `getSessionUser(token): Promise<{userId; role} | null>` (истекшая → null + удаление). `destroySession(token)`.
- `type StudentViewer = {userId: string; role: 'student'; studentId: string; groupId: string; facultyId: string; course: number}`; `type StaffViewer = {userId: string; role: 'staff'; staffId: string; departmentIds: string[]}`; `type Viewer = StudentViewer | StaffViewer` — в `src/server/auth/viewer.ts`, их используют все следующие задачи. `getViewer(): Promise<Viewer|null>` (cookie → сессия), `requireStudent(): Promise<StudentViewer>` и `requireStaff(): Promise<StaffViewer>` — иначе `redirect('/login')` / `notFound()` для чужой роли.
- Cookie: имя `__Host-ns_session`, если `COOKIE_SECURE=true`, иначе `ns_session`; `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `secure` по флагу.
- `login(login, password, ip, now): Promise<{ok: true; token; role} | {ok: false; error: 'invalid'|'rate_limited'; retryAfterSec?: number}>`. Лимиты: 5 неудач на пару `login+ip` за 15 мин, 30 неудач на `ip` за 15 мин. Для неизвестного логина всё равно выполняется `verifyPassword` с фиктивным хешем (сопоставимое время). Сообщение пользователю одно: «Неверный логин или пароль».
- Server Action `loginAction(formData)`: zod (`login` 3–64, `password` 1–128), IP из `x-forwarded-for` (первый адрес, которому доверяем, только за Caddy) или `x-real-ip`; при успехе редирект на `/` (student) или `/staff`. `logoutAction()`.

- [ ] **Step 1:** Тесты: успех; неверный пароль и неизвестный логин дают одинаковое `error: 'invalid'`; 6-я неудача с той же пары → `rate_limited`, а с другого IP вход для того же логина работает (нет DoS по логину); в `sessions.token_hash` нет исходного токена; истекшая сессия → `null`; пользователь без логина (вымышленный студент) войти не может.
- [ ] **Step 2:** Run → FAIL. Реализовать. Run → PASS.
- [ ] **Step 3:** Commit `feat(auth): argon2id, сессии в БД, лимит попыток`.

