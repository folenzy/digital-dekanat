# Task 12 report: экраны студента (вход, Сегодня, Пары, Учёба, Профиль, Уведомления, О проекте)

**Status:** DONE_WITH_CONCERNS (concerns below; none blocks Task 13+)
**Model:** Claude Opus 5.5. The `frontend-design` skill was invoked first. I reused the «Бумага» design system and did not invent a new one.
**Note:** the run was interrupted when the controller restarted. Work resumed from the uncommitted working tree. Docker Desktop was not running, so I started it and ran `npm run db:up`.

## Commits (feat/volna-1, not pushed)
- `cc212f8` feat(ui): тексты экранов студента — приветствие, сводка дня, параметры расписания
- `2d62025` feat(ui): компоненты экранов студента — карточка пары, вкладки, блоки, заготовки загрузки
- `ff8162e` feat(ui): экраны студента
- `0bff839` test(e2e): экраны студента на 360 и 1280 px, свежий демо-мир перед прогоном

## Pages (src/app)
| Route | File | What it does |
|---|---|---|
| `/login` | `(auth)/login/page.tsx`, `LoginForm.tsx`, `login.module.css`, `loading.tsx`, `error.tsx` | **Form:** `useActionState(loginAction, null)`, labelled inputs (`autocomplete=username/current-password`), show/hide password button whose aria-label switches «Показать пароль» / «Скрыть пароль», spinner on «Войти». **Error handling:** the error has `role=alert`; after an error the login field keeps its value (controlled input) and focus moves to the password. **Expired session:** `?reason=expired` shows the fixed text, and any other `reason` is ignored. **Other:** ConceptBanner; no test credentials, only «Логины для проверки — в README и в комментарии к конкурсной работе»; a logged-in user is redirected to `/` or `/staff`. `error.tsx` covers network failure («Не получилось связаться с сервером»). |
| `/` | `(student)/page.tsx`, `today.module.css`, `loading.tsx`, `error.tsx` | **Header:** kicker «Воскресенье, 8 ноября», h1 «<greeting by MSK hour>, <first name>», summary sentence. **Blocks in §7.2 order:** (1) nudges: the first is an ink card «Деканат пишет первым», the others accent cards with a kind label; (2) «Пары сегодня»: current, next and past states, changes shown as было → стало; on an empty day «Сегодня пар нет. Следующая — <день>, <пара>» plus a card for that lesson; (3) «Мои обращения»: status, promised answer time, sorted needs_info → ready → in work; empty state «Активных обращений нет. Написать в деканат →» links to `/dekanat`; (4) «Скоро дедлайны» with a «через N дней» chip; (5) the latest announcement. |
| `/schedule` | `(student)/schedule/page.tsx`, `schedule.module.css`, `loading.tsx`, `error.tsx` | **URL state:** `?view=day\|week&date=YYYY-MM-DD`, validated: wrong format, impossible dates (2026-02-30) and dates more than 366 days from today fall back to today. **Navigation:** «День / Неделя» tabs; week arrows (`aria-label` «Предыдущая/Следующая неделя»); «9–14 ноября» plus «нечётная неделя». **Day strip** Mon–Sat (`nav aria-label="Дни недели"`): selected day dark, today underlined, dots = number of lessons (terracotta if the day has changes), and a screen-reader text for each day. **Lessons:** change badges with было → стало, current pair highlighted. **Empty states:** a day with no lessons gets «В субботу пар нет» plus «Показать неделю»; in the week view such a day reads «Пар нет». **Other:** the «К сегодняшнему дню / К текущей неделе» link appears only when you have moved away from today. |
| `/study` | `(student)/study/page.tsx`, `study.module.css`, `loading.tsx`, `error.tsx` | **Verdict card «Как у меня дела»:** good is a paper card, risks an accent card, debts an ink card. It holds the human-language text, a list of debts and risks, and three figures: average «4,8», debts, admission «6 из 6». **Tabs** `?tab=semester\|session\|history`. **Semester:** control form, admission badge, points 0–100 with a bar and a hatched segment for points still available in checkpoints, the preliminary grade, and checkpoints in `<details>` (open automatically if there is a risk). **Session:** retakes first (accent), then exams and credits with date, time and room. **Gradebook («Зачётка»):** grades by semester with the average. Each tab has an empty state. |
| `/profile` | `(student)/profile/page.tsx`, `profile.module.css`, `loading.tsx`, `error.tsx` | All fields from §7.7, an initials avatar, a link to «О проекте», and «Выйти» (`<form action={logoutAction}>` + SubmitButton). |
| `/notifications` | `(student)/notifications/page.tsx`, `actions.ts`, `ItemButton.tsx`, `notifications.module.css`, `loading.tsx`, `error.tsx` | **Tabs:** `?tab=notifications\|announcements`; the first tab shows an unread counter. **Filter** «Все / Непрочитанные» (`?filter=unread`, spec §7.6) and «Прочитать всё». **Items:** each notification is a form-button: opening it marks it read and follows its href. **Announcements:** «важное» first, with audience and full text. **Empty state:** «Новых уведомлений нет». |
| `/about` (public) | `about/page.tsx`, `about.module.css`, `loading.tsx`, `error.tsx` | **Content:** the concept and «всё выдумано»; where the accounts are (README and the submission comment, no passwords); «Демо-данные возвращаются к исходному состоянию каждую ночь в 04:00 МСК»; protection in plain words (argon2id, a session key whose sha-256 hash is stored, httpOnly cookie, 7 days, «каждый видит только своё», 5 attempts per login+address per 15 minutes and 30 per address, staff sees only a minimum, 10 appeals and 30 messages per hour). **Invented deanery** (checked against `kb-articles.ts` and `people.ts`): единое окно корпус А каб. 214 пн–пт 10:00–17:00 обед 13:00–14:00; учебный отдел вт/чт 11:00–16:00 каб. 210; three departments; deadlines 1/2/3 working days; a certificate is kept 5 working days; the stipend arrives by the 25th. |
| 404 | `not-found.tsx` | «Страница не найдена» with a «На главную» button, on PublicPage (with ConceptBanner). |
| errors above pages | `error.tsx` (root) | Catches errors in the `(student)` shell layout. |

`(student)/layout.tsx` calls `requireStudent()`, then `getProfile` and `unreadCount`, and renders `AppShell role="student"`. Every page calls `requireStudent()` itself as well. I deleted `src/app/page.tsx`.

## Server actions
`src/app/(student)/notifications/actions.ts` (`"use server"`):
- `openNotificationAction(formData: FormData): Promise<void>`:
  - calls `requireStudent()` and parses `id` with zod (int, positive);
  - calls `markRead(v, id)`, whose owner check lives in the query itself;
  - takes the href from the user's own DB record (not from the form) and checks it with `isSafeHref`;
  - then calls `revalidatePath("/", "layout")` + `redirect(href)`; with no href it calls `refresh()`.
- `markAllReadAction(): Promise<void>`: calls `requireStudent()`, then `markAllRead(v)`, then `refresh()`.

No action takes `now` or any user/student id from the client.

## New helpers and components (interfaces for later tasks)
- `src/server/format.ts`:
  - `ruWeekday(key)` «понедельник»; `ruWeekdayShort(key)` «Пн»; `ruDayTitle(key)` «Понедельник, 9 ноября»;
  - `mskTime(d)` «09:05»; `prettyTime("09:00")` «9:00»; `ruWhen(d, now)` «сегодня, 14:20» / «вчера, …» / «5 ноября, …»;
  - `plural(n, [one, few, many])`; `dayDiff(fromKey, toKey)`;
  - `greeting(now)`: 5–11 / 12–16 / 17–22 / otherwise night, by MSK hour;
  - `shortPersonName(full)` «Ковалёва М. А.» with non-breaking spaces;
  - `pairName(n)`: «2-я пара» with U+2060 after the hyphen, so it never splits across lines.
- `src/ui/safe-href.ts`: `isSafeHref` moved out of `LiveEvents.tsx` (a client module cannot be called on the server). `LiveEvents` re-exports it, so the old test is unchanged.
- `src/ui/student/labels.ts`: `LESSON_TYPE_LABEL`, `CHANGE_META` (Перенос, Отменена, Замена преподавателя, Новая аудитория, Доп. занятие, with tones), `CONTROL_FORM_LABEL`, `EXAM_KIND_LABEL`, `gradeLabel`, `isDebtGrade`, `VERDICT_COPY`, `buildingName`.
- `src/ui/student/today.ts`: `todaySummary({lessons, current?, next?, appeals}, now)`, `nextLessonPhrase(next, now)`, `appealPromise(item, now) → {text, tone}`. Task 13 can reuse `appealPromise` for its appeal lists.
- `src/ui/student/schedule-params.ts`: `parseScheduleParams(sp, now) → {view, dateKey, today}`, `mondayOf`, `weekLabel`, `scheduleHref`.
- `src/ui/student/LessonCard.tsx`: `LessonCard({lesson, state?: "current"|"next"|"past", kicker?, titleAs?, compact?})`.
- `src/ui/Tabs.tsx`: `Tabs({label, items: {href,label,current,count?}[], size?: "md"|"small"})`, link tabs with `aria-current="page"`.
- `src/ui/Section.tsx`: `Section({title, action?, children})`, an h2 with an optional link.
- `src/ui/SubmitButton.tsx` (client, `useFormStatus`): a submit button for server-action forms, with a spinner and a double-tap guard.
- `src/ui/PublicPage.tsx`: the frame for pages without login (ConceptBanner, logo, column).
- `src/ui/PageSkeleton.tsx`: `HeaderSkeleton`, `TabsSkeleton`, `SectionTitleSkeleton`, `StripSkeleton`, `CardsSkeleton({count, lines, spaced})`.
- `EmptyState.titleAs` now also accepts `"h1"` (for the 404 page).

## Tests and results
- **Unit tests (Vitest):**
  - `tests/ui/student-text.test.ts`, 31 tests: greeting at the hour boundaries, including server-in-UTC 21:30Z → night; dates, times, plural; summary cases (before the first pair, current pair, break, end of day, day off, all cancelled, needs_info/ready/in work); promised answer time; `parseScheduleParams` (junk, 2026-02-30, out of range, arrays, Sunday → Monday); `weekLabel`; `isSafeHref` on the server.
  - `tests/ui/student-components.test.tsx`, 6 tests: LessonCard (current, было → стало with words for screen readers, move, cancellation, user text escaped); Tabs (`aria-current`, counter hidden from screen readers).
- **E2E:** `e2e/student.spec.ts`, 9 scenarios × 2 projects = **18 passed**. `npx playwright test` → `18 passed (59.1s)`.
- **Full suite:** `npm test` → **26 files, 299 passed**. `npx tsc --noEmit` and `npx eslint .` are clean. `npm run build` passes (it is part of the Playwright webServer command).

### TDD evidence
- **Unit RED:** `npx vitest run tests/ui/student-text.test.ts` → `Error: Cannot find package '@/ui/student/labels'`. Expected: the modules did not exist yet.
- **Unit GREEN:** `Tests 31 passed`.
- **Second RED:** I changed the tests for `pairName` and the «2-я» wrap first → `4 failed | 26 passed`. GREEN after the change.
- **E2E RED:** `npx playwright test -g "пометка концепта" --project=desktop-1280` failed with «getByText('Концепт…') element(s) not found». The page snapshot was the default `404 This page could not be found`: `/login` did not exist.
- **E2E GREEN:** 18 passed, as above. Along the way I fixed my own test locators: substring matches like «Неделя» vs «Следующая неделя», the Next route announcer also has `role=alert`, the nbsp in «04:00 МСК», and the 404 document itself shows up in the console.
- **Not TDD:** `student-components.test.tsx` was written after LessonCard and Tabs existed. It passed on the first run except for one assertion with the wrong attribute order (a test bug). There was no RED.

### E2E design
- **Fresh world before the run:** `playwright.config.ts` loads `.env` via `process.loadEnvFile` and sets `globalSetup: e2e/global-setup.ts`. That setup runs `scripts/migrate.ts` and `scripts/demo-reset.ts` through tsx against `DATABASE_URL`, the same DB the started standalone server uses. Playwright starts the webServer before globalSetup (checked in `node_modules/playwright/lib/runner/index.js`).
- **Credentials:** passwords come only from `process.env` and are never printed. The test checks that neither the password nor the login appears in the HTML of `/login`.
- **Mutating test:** the «уведомления» describe resets the world in `beforeAll` and `afterAll`. Without that, the mobile run marks everything read, and the desktop screenshots would show a bell with no counter.
- **Every page:** `scrollWidth <= clientWidth` at 360 and 1280.
- **Console:** no console errors allowed. The exceptions are 404s from prefetching `/dekanat/*` (pages arrive in Task 13) and the 404 page's own document.
- **Config changes:** baseURL and webServer.url are `127.0.0.1`; the mobile window is 360×800 with `deviceScaleFactor: 2`.

### Screenshots (docs/screenshots, each at -360 and -1280; full page, nav made static for the shot)
`02-login`, `02-login-expired`, `02-today` (Алина), `02-today-denis`, `02-schedule-day` (the nearest weekday with changes), `02-schedule-week`, `02-study`, `02-study-session`, `02-study-history`, `02-study-denis`, `02-notifications`, `02-announcements`, `02-profile`, `02-about`, `02-not-found`. That is 30 files.

## UX decisions (frontend-design)
- **One bold device, and it is not new: the Task 11 typography and ribbon.** Lesson times are set in large Literata, like a planner, and the current pair carries the same terracotta ribbon as the active section in the nav: "you are here and now". The verdict on «Учёба» and the motto on the login page are the only big headings.
- **Login:** the hero is the idea from spec §1, «Деканат, до которого можно достучаться». On the phone I hid the explanatory paragraph so the form fits on the first screen at 360×800.
- **No repeated sentence:** on a day without lessons the summary under the greeting does not repeat «Сегодня пар нет…», because the block says it verbatim. When the day's lessons are over, the block shows the next lesson's card instead of the same sentence.
- **Preliminary grade, the main divergence:** the server's `preliminary` is computed from points out of 100. In the middle of the semester that gave Alina, a straight-A student, «неудовлетворительно» in every discipline (35/100). The screen instead shows «Предварительно — отлично: 35 из 40 за сданные точки. Впереди точки ещё на 20 баллов, остальное — на экзамене.» (`preliminaryGrade` applied to the share of points in completed checkpoints). The bar shows earned points plus a hatched segment for points still available. If you want strictly the server field, it is a one-line change.
- **Sunday:** the study week is Mon–Sat, so `/schedule` shows Monday on a Sunday, with the note «Сегодня воскресенье, поэтому показываем понедельник.» On Sundays the «К сегодняшнему дню» link is hidden.
- **Opening a notification is a form-button, not a link:** that way, without JS too, opening one marks it read on the server, and the href comes from the DB. The trade-off is that you cannot open it in a new tab with a middle click.
- **Appeals on «Сегодня»** are sorted by urgency: needs_info first, then ready.
- **Typography details:** «2-я пара» never splits («2-» / «я»), «корпус А» never splits, and teacher initials stay with the surname.

## Concerns
1. **Links to Task 13 pages:** `/dekanat`, `/dekanat/<id>` and `/dekanat/new?type=…` (nudges, appeal cards, deadlines) lead to 404 until Task 13. Their prefetches give 404s in the console; e2e filters them.
2. **Preliminary grade:** see «UX decisions». The server field `EnrollmentView.preliminary` is not used on the screen.
3. **`globalSetup` resets the DB in `.env`'s `DATABASE_URL` (dev :5432):** running e2e wipes local demo changes. That is the intended «fresh world», but worth knowing.
4. **Proxy/CSP is not in place yet (Task 10):** e2e runs without CSP. Inline `style` is used for the score-bar width and skeletons, which is allowed by `style-src 'unsafe-inline'` in the plan.
5. **The «О проекте» texts describe features that are already implemented.** The nightly 04:00 reset is still a schedule from Task 16, but spec §10 requires that text.
6. **Accessibility:** every SkeletonCard has its own `role="status"` (a Task 11 component), so during loading a screen reader may hear «Загружаем…» several times.
7. **`src/server/format.ts` grew by about 70 lines of general-purpose helpers.** I did not split it.

---

## Fix report 1 (review round 1)

**Commit:** `ba7815e` fix(ui): экраны студента — ревью 1: сброс только локальной БД, оценка по темпу на сервере, фильтр консоли

### 1. e2e resets only a local DB (Important)
- **Change:** new `e2e/local-db.ts` exports `assertLocalDatabaseUrl(url)`.
  - Allowed hosts: `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`.
  - It throws on an unparsable or empty URL, and on a unix socket without a host.
  - The error text contains neither the URL nor the host or password.
- **Change:** `resetDemoWorld()` (e2e/demo.ts):
  - loads `.env` if `DATABASE_URL` is not set;
  - checks the URL **before** spawning anything;
  - passes the scripts exactly the checked value (`env: {...process.env, DATABASE_URL: url}`).
  - I checked that `process.loadEnvFile` inside the scripts does not overwrite an existing variable, so the scripts get exactly that address.
- **Tests:** `tests/e2e-local-db.test.ts` (14).
  - Allowed: localhost, 127.0.0.1, [::1], db.localhost, LOCALHOST.
  - Rejected: db.example.com, 10.0.0.5, localhost.evil.com, 127.0.0.1.nip.io, a socket without a host, junk, empty, undefined.
  - The error contains neither the password nor the host.
- **RED:** `Cannot find module '../e2e/local-db'`. **GREEN:** 14 passed.
- **Live check:** `DATABASE_URL='postgres://admin:topsecret@db.example.com:5432/prod' npx tsx -e '…resetDemoWorld()'` → `BLOCKED: Сброс демо-мира в e2e разрешён только для локальной БД (localhost, 127.0.0.1, [::1], *.localhost). Проверь DATABASE_URL в .env или окружении.` No script was started.

### 2. The pace grade moved to the server, one meaning of «предварительно» (Important)
- **Change:** `src/server/grades.ts`:
  - `paceGrade(checkpoints)`: the share of points in graded checkpoints, mapped to the `preliminaryGrade` scale.
  - It returns `null` when fewer than `PACE_MIN_POINTS = 20` points **and** fewer than `PACE_MIN_CHECKPOINTS = 2` checkpoints are graded (controller ruling).
  - Exports `type Pace = {grade, score, max}`.
  - **`EnrollmentView.preliminary` is removed** and replaced by `pace: Pace | null`, with a doc comment saying which is which. `preliminaryGrade(points)` stays as the scale.
- **Change:** `study/page.tsx` reads only `e.pace`; the calculation in the component is gone.
  - With `null` the screen shows «Пока мало оценок для предварительной оценки.»
  - If no checkpoint is graded yet: «Пока мало оценок: контрольные точки ещё впереди.»
- **Tests:**
  - `tests/grades-pace.test.ts` (3): the share of graded points, with ungraded ones ignored; «отлично», «хорошо», «удовлетворительно».
  - `null` for no checkpoints, all ungraded, one checkpoint at 5/5, and 19/19 + an ungraded one.
  - Enough: one checkpoint of 20 points, or two graded checkpoints (4/5 + 5/5).
  - `tests/student-read.test.ts` now expects `pace: { grade: "отлично", score: 35, max: 40 }` for Alina's Матан, instead of `preliminary: "неудовлетворительно"`.
- **RED:** `TypeError: paceGrade is not a function` (×3). **GREEN:** `tests/grades-pace.test.ts` + `tests/student-read.test.ts` → 31 passed.

### 3. Empty notifications state (Important)
- **Analysis (honest):** in the original expression `all.length && filter === "unread" ? <Button/> : undefined` the operator `?:` binds looser than `&&`. With zero notifications it evaluates to `(0 && …) ? … : undefined` → `undefined`, so a literal «0» did not render. Checked: `node -e 'const total=0, filter="unread"; console.log(JSON.stringify(total && filter === "unread" ? "BUTTON" : undefined))'` → `undefined`.
- **Change:** the condition is still made explicit (`total > 0 && …`) for readability. The empty state moved into a separate component, `src/app/(student)/notifications/NotificationsEmpty.tsx` (`{ total, filter }`), and the page uses it.
- **Test:** `tests/ui/notifications-empty.test.tsx` (2):
  - with 0 notifications (both filters), the text is «Когда деканат ответит…», with no «Показать все» and no `>0<`;
  - when everything is read under the «Непрочитанные» filter, it shows «Всё прочитано» and «Показать все» → `/notifications`.
- **TDD:** I first extracted the component with the **original** expression, and the test passed. That confirms the analysis: it is a regression guard, not a RED.

### 4. Narrowed e2e console filter
- **Change:** the filter no longer forgives every error whose URL contains `/dekanat`. The forgiven case is now narrowed to:
  - responses whose request carries the `next-router-prefetch` or `next-router-segment-prefetch` header (names checked in `node_modules/next/dist/client/components/app-router-headers.js`);
  - with status 404 and a path that starts with `/dekanat`;
  - only a console error with **exactly that URL** and the text «404» is forgiven.
- **When it runs:** filtering happens in `afterEach`, so it does not depend on the order of the `response` and `console` events.
- **The 404 test:** it forgives only the 404 of its own document `/takoy-stranitsy-net`.
- **Diagnostic (throwaway spec, deleted):** after Alina signs in, `/dekanat` and `/dekanat/new` give `404 prefetch=true seg=true`, plus a console «Failed to load resource» for the same paths, and nothing else. The comment in the spec says Task 13 will remove the exception.

### Commands and output
- `npx vitest run tests/ui tests/grades-pace.test.ts tests/e2e-local-db.test.ts tests/student-read.test.ts` → `Test Files 9 passed (9) · Tests 141 passed (141)`
- `npx playwright test e2e/student.spec.ts` → `18 passed (46.2s)`
- `npm test` → `Test Files 29 passed (29) · Tests 318 passed (318)`
- `npx tsc --noEmit`, `npx eslint .` → clean; `npm run build` → `✓ Compiled successfully`
- The e2e run regenerated the screenshots (times in the texts and the «Учёба» tabs changed); they are in the commit.
