### Task 3: Время МСК и демо-мир с ночным сбросом

**Files:**
- Create: `src/server/time.ts`, `src/server/demo/world.ts`, `src/server/demo/people.ts`, `src/server/demo/kb-articles.ts`, `scripts/demo-reset.ts`, `src/app/api/internal/demo-reset/route.ts`
- Test: `tests/time.test.ts`, `tests/demo/world.test.ts`

**Interfaces:**
- Produces (`time.ts`): `mskDateKey(now: Date): string` (`'2026-11-07'`), `mskWeekday(now: Date): 1..7`, `weekParity(date: Date): 'odd'|'even'` (точка отсчёта: 1 сентября 2026 = неделя 1, нечётная), `addWorkingDays(from: Date, n: number): Date` (результат: 18:00 МСК n-го рабочего дня после даты `from`; день `from` не считается; рабочие дни Пн–Пт, праздники не учитываем), `isOverdue(due: Date, now: Date): boolean`.
- Produces (`world.ts`): `buildDemoWorld(db, now: Date, passwords: {alina: string; denis: string; irina: string}): Promise<void>` — в одной транзакции `TRUNCATE … RESTART IDENTITY CASCADE` всех таблиц (включая `sessions`), затем вставка. `resetDemo(now = new Date())` читает пароли из env.
- Логины: `alina.mironova`, `denis.kravtsov`, `irina.belova`. Пароли — случайные (16 символов), сгенерировать один раз, записать в `.env` (не выводить в чат) и в `README.md` (Task 17).
- Содержимое демо-мира (спека §6, §10): 3 факультета (ФПМИ, ФЭУ, Гуманитарный), группы ПМИ-24-1 и ЭК-23-2 (+ по 1 доп. группе), 3 отдела (`docs` «Справки и документы», `study` «Учебный отдел», `stipend` «Стипендиальный отдел»), Ирина во всех трёх; по 5–6 дисциплин на группу, шаблон расписания на обе чётности; изменения на `today` и `today+1` для обеих групп (минимум: перенос аудитории и отмена); у Алины прошлая сессия на «отлично» (средний ≥ 4,5); у Дениса «неуд» по одной дисциплине прошлой сессии + пересдача через 5–10 дней и несданная обязательная контрольная точка со сроком через 3 дня; обращения: Алина — `cert_military` `in_progress`, `sla_due_at` в будущем; Денис — `study_retake` `needs_info` с вопросом сотрудника, `cert_study` `ready`; у Ирины в очереди дополнительно 2 `submitted` от вымышленных студентов без логина (у них `users.login = null`, вход невозможен); 4 объявления (1 важное) с разной аудиторией; уведомления по 3–5 на студента; 25 статей базы ответов по трём темам. Окно приёма на повышенную стипендию: `[today-7, today+14]`.
- `POST /api/internal/demo-reset`: заголовок `x-reset-token` = `DEMO_RESET_TOKEN`, сравнение через `timingSafeEqual`; иначе 404.

- [ ] **Step 1:** Тесты `time.test.ts`: `mskDateKey(new Date('2026-11-07T21:30:00Z')) === '2026-11-08'`; `addWorkingDays(new Date('2026-11-07T12:00:00Z') /*сб*/, 1)` → `2026-11-09T15:00:00Z` (пн 18:00 МСК); `addWorkingDays(пт 2026-11-06T12:00Z, 1)` → пн `2026-11-09T15:00:00Z`; `weekParity(2026-09-01)` → `'odd'`, `weekParity(2026-09-08)` → `'even'`.
- [ ] **Step 2:** Тесты `world.test.ts`: после `buildDemoWorld(db, now, pw)` — ровно 3 пользователя с логином; `password_hash` начинается с `$argon2id$` и не равен паролю; у Алины и Дениса разные факультеты; есть `schedule_changes` с датой `today` для обеих групп; `sla_due_at` активного обращения Алины > now; повторный `buildDemoWorld` удаляет созданное «пользователем» обращение и все `sessions`.
- [ ] **Step 3:** Run → FAIL. Реализовать. Run → PASS.
- [ ] **Step 4:** Тест роута: без токена или с неверным → 404; с верным → 200, мир пересобран.
- [ ] **Step 5:** Commit `feat(demo): время МСК и демо-мир с ночным сбросом`.

