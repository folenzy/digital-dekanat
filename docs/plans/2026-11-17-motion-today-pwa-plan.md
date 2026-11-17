# «Как приложение»: иконка, движение, следующая пара — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Иконка «На связи» на экране «Домой» и запуск без адресной строки; движение в четырёх местах; блок «Следующая пара» с живым отсчётом первым на «Сегодня».

**Architecture:** Иконки — статичные PNG в `src/app/` по соглашениям Next 16 (`manifest.ts`, `apple-icon.png`), сделанные одноразовым скриптом из `icon.svg`. Состояние блока следующей пары — чистая функция `todayHero` (тестируется без БД), отображение — клиентский компонент `NextLesson`, который пересчитывает раз в минуту. Переходы между экранами — React 19.3 `<ViewTransition>` в `template.tsx` групп и `transitionTypes` на ссылках; анимации раскрытия пары и полосы баллов — CSS.

**Tech Stack:** Next.js 16.4 (App Router), React 19.3, TypeScript, CSS Modules на токенах, sharp (уже в `node_modules`, только для скрипта иконок), Vitest, Playwright 360/1280, axe.

**Spec:** `docs/specs/2026-11-17-motion-today-pwa-design.md`

## Global Constraints

- Тексты дословно: «Следующая пара», «через N мин», «в HH:MM» (если до начала больше 180 мин), «Идёт сейчас», «осталось N мин», «дальше — <Предмет>, HH:MM», «На сегодня всё. <Завтра|В понедельник|…> первая — H:MM, <Предмет>», «Следующая пара — <в понедельник|завтра|…>, H:MM, <Предмет>», «прошла K из N · до конца пар X ч Y мин».
- Время — московское (`mskDateKey`, `mskMinutes` и т. п. из `src/server/time.ts` / `src/server/format.ts`).
- Анимации 150–250 мс; все выключены при `prefers-reduced-motion: reduce`; где браузер не умеет — экран меняется сразу, без ошибок.
- Блок пары — рамка, не заливка; синяя заливка на экране одна (плашка деканата). Без `aria-live` у блока.
- Иконки: синий фон `#1E6FD9`, белый знак той же формы, что в нынешнем `src/app/icon.svg`; `icon.svg` перекрашивается так же.
- Манифест: `name` «На связи — цифровой деканат», `short_name` «На связи», `display` `standalone`, `start_url` `/`, `background_color` и `theme_color` `#FFFFFF`, иконки 192 и 512 (512 — ещё и `purpose: "maskable"`).
- Строгий CSP: без встроенных скриптов; новых зависимостей нет.
- Коммиты без `Co-Authored-By` и без упоминаний Claude.

## Review Focus

1. **Листание дня пальцем не даёт второй анимации** (палец уже сдвинул экран — `router.push` без типа перехода). → e2e в задаче 6: при свайпе `document.startViewTransition` не вызывается, при нажатии «›» — вызывается.
2. **Граница пары:** ровно в начало пары блок уже «Идёт сейчас», ровно в конец — уже следующее состояние, без «осталось 0 мин». → тесты задачи 2.
3. **Телефон был заблокирован 2 часа:** при возвращении блок сразу показывает верное состояние, а не старые минуты. → тест компонента в задаче 3 (`visibilitychange`) и e2e `page.clock` в задаче 6.
4. **Отменённая пара** не считается в полосе дня и не становится «следующей». → тесты задачи 2.
5. **Раскрытие пары после анимации** по-прежнему открывается и закрывается с первого нажатия, высота не «застревает». → e2e задачи 6 (повторяет нажатия дважды).

---

### Task 1: Иконки и манифест

**Files:**
- Modify: `src/app/icon.svg` (цвета), `src/app/layout.tsx` (метаданные `appleWebApp`)
- Create: `scripts/make-icons.mjs`, `src/app/manifest.ts`, `src/app/apple-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`
- Test: `tests/manifest.test.ts`

**Interfaces:** Produces: `export default function manifest(): MetadataRoute.Manifest` в `src/app/manifest.ts`.

- [ ] **Step 1: Failing test** `tests/manifest.test.ts`: `manifest()` → `name` «На связи — цифровой деканат», `short_name` «На связи», `display` «standalone», `start_url` «/», `background_color` и `theme_color` «#FFFFFF»; среди `icons` есть `{src:"/icon-192.png",sizes:"192x192",type:"image/png"}`, `{src:"/icon-512.png",sizes:"512x512"}` и `{src:"/icon-maskable-512.png",sizes:"512x512",purpose:"maskable"}`; каждый файл иконки существует в `public/` и его размеры (через `sharp(...).metadata()`) совпадают с `sizes`; `src/app/apple-icon.png` — 180×180; в `src/app/icon.svg` нет `#B4552D` и есть `#1E6FD9`.
- [ ] **Step 2: Run** `npx vitest run tests/manifest.test.ts` → FAIL.
- [ ] **Step 3: Implement** перекраску `icon.svg` (фон `#1E6FD9`, знак `#FFFFFF`), скрипт `scripts/make-icons.mjs` (sharp: SVG → PNG 192/512/180; maskable-512 — знак уменьшен до безопасной зоны ~80 % на синем поле), запустить его один раз и закоммитить PNG; `manifest.ts`; в `layout.tsx` — `appleWebApp: { capable: true, title: "На связи", statusBarStyle: "default" }` (проверь поля по `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`).
- [ ] **Step 4: Run** `npx vitest run tests/manifest.test.ts` и `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(app): иконка на экране «Домой» и запуск как приложение — манифест, apple-icon, синий знак`.

### Task 2: Состояние блока «Следующая пара»

**Files:**
- Create: `src/ui/student/today-hero.ts`
- Test: `tests/ui/today-hero.test.ts`

**Interfaces:**
- Consumes: `Lesson` (`src/server/schedule.ts`), `NextLesson = Lesson & { dateKey: string }` (`src/ui/student/today.ts`, экспортировать тип оттуда, если не экспортирован).
- Produces:
  - `type DayProgress = { total: number; passed: number; currentShare: number; leftMinutes: number }` — `total` неотменённых пар сегодня; `passed` закончившихся; `currentShare` 0..1 доля прошедшего времени идущей пары (0, если не идёт); `leftMinutes` до конца последней неотменённой пары.
  - `type TodayHero = { kind: "before"; lesson: NextLesson; minutes: number | null; progress: DayProgress } | { kind: "during"; lesson: NextLesson; minutesLeft: number; after: NextLesson | null; progress: DayProgress } | { kind: "done"; next: NextLesson | null } | { kind: "free"; next: NextLesson } | null`
  - `todayHero(todayLessons: readonly Lesson[], todayKey: string, upcoming: NextLesson | undefined, now: Date): TodayHero`

- [ ] **Step 1: Failing tests** (сегодня 2026-11-17, пары 1 09:00–10:30, 2 10:40–12:10, 3 12:40–14:10, время МСК):
  - 10:15 → `during`, пара 1, `minutesLeft` 15, `after` — пара 2, `progress {total:3, passed:0, currentShare: 75/90, leftMinutes: 235}`;
  - 10:30 ровно → не `during` пары 1: `before` пары 2, `minutes` 10; 09:00 ровно → `during` пары 1, `minutesLeft` 90;
  - 10:15 при отменённой паре 2 → `after` — пара 3, `progress.total` 2;
  - 06:00 → `before` пары 1, `minutes` null (больше 180), 08:00 → `minutes` 60;
  - 14:10 и позже, `upcoming` — завтра 09:00 → `done` с `next` завтрашней; без `upcoming` → `done` с `next: null`;
  - сегодня пар нет, `upcoming` в понедельник → `free`; пар нет и `upcoming` undefined → `null`;
  - минуты округляются вверх: 10:14:30 → `minutesLeft` 16.
- [ ] **Step 2: Run** `npx vitest run tests/ui/today-hero.test.ts` → FAIL.
- [ ] **Step 3: Implement** `todayHero` (минуты МСК от `now`; отменённые пары исключаются везде).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(today): расчёт блока «Следующая пара» — до, во время, после пар, выходной`.

### Task 3: Блок «Следующая пара» на «Сегодня»

**Files:**
- Create: `src/ui/student/NextLesson.tsx` (`"use client"`), `src/ui/student/NextLesson.module.css`
- Modify: `src/app/(student)/page.tsx` (блок первым под заголовком, до плашки деканата)
- Test: `tests/ui/next-lesson.test.tsx`

**Interfaces:**
- Consumes: `todayHero`, `TodayHero`, `DayProgress` (задача 2); `nextDayLabel(dateKey, now)` и `pairName` (`src/ui/student/today.ts`, `src/server/format.ts`); `LESSON_TYPE_CODE` (`src/ui/student/schedule-view.ts`); `scheduleHref("day", dateKey)`.
- Produces: `NextLesson({ lessons, todayKey, upcoming, nowIso }: { lessons: Lesson[]; todayKey: string; upcoming?: NextLesson; nowIso: string })`.

- [ ] **Step 1: Failing tests** (`renderToStaticMarkup` при `nowIso` сервера): «Следующая пара» + «через 25 мин» + «Математический анализ» + «ЛК» + «2-я пара» + «10:40–12:10» + «А-301, корпус А»; при >180 мин — «в 14:20» и нет «через»; во время — «Идёт сейчас», «осталось 34 мин», «дальше — Английский язык, 14:20»; полоса — подпись «прошла 1 из 3 · до конца пар 4 ч 30 мин», сама полоса `aria-hidden="true"`; `done` — «На сегодня всё. Завтра первая — 9:00, Дискретная математика»; `free` — «Следующая пара — в понедельник, 9:00, …»; `null` — пустая разметка; ссылка ведёт на `/schedule?date=<dateKey>` (через `scheduleHref`); в разметке нет `aria-live`; рамка, не `data-surface="ink"`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/next-lesson.test.tsx` → FAIL.
- [ ] **Step 3: Implement:** первый рендер — по `nowIso` (совпадает с сервером, без расхождения гидратации); после монтирования — таймер до следующей границы минуты, затем раз в минуту, и пересчёт на `visibilitychange` (когда вкладка снова видна); `now` — `new Date()`. На странице `page.tsx` передать сегодняшние пары, `todayKey`, `next` из `getTodayOverview` и `now.toISOString()`.
- [ ] **Step 4: Run** `npx vitest run tests/ui` и `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(today): блок «Следующая пара» первым — живой отсчёт и полоса дня`.

### Task 4: Движение в CSS — раскрытие пары и полоса баллов

**Files:**
- Modify: `src/ui/student/LessonCard.module.css`, `src/ui/student/SubjectCard.module.css`
- Test: `tests/ui/motion-css.test.ts`

- [ ] **Step 1: Failing test** (читает CSS-файлы как текст, как `tests/deploy-config.test.ts` читает конфиги): в `LessonCard.module.css` есть правило для раскрытой части `::details-content` с `transition` и блок `@media (prefers-reduced-motion: reduce)`, который его отключает; в `SubjectCard.module.css` у заливки полосы есть `animation` с `@keyframes` от нулевой ширины/масштаба и тот же блок reduced-motion; длительности в обоих файлах в пределах 150–250 мс.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:** раскрытие — `details::details-content` с переходом `block-size` и `opacity` (`interpolate-size: allow-keywords` на `details` и `transition-behavior: allow-discrete` для `content-visibility`); полоса — `transform: scaleX` от 0 с `transform-origin: left` (ширина задаётся инлайн, анимируется только масштаб); reduced-motion — `transition: none; animation: none`.
- [ ] **Step 4: Run** `npx vitest run tests/ui` → PASS.
- [ ] **Step 5: Commit** `feat(motion): плавное раскрытие пары и заполнение полосы баллов`.

### Task 5: Переходы между экранами

**Files:**
- Create: `src/app/(student)/template.tsx`, `src/app/staff/template.tsx`
- Modify: `src/ui/NavLink.tsx` (тип перехода `section`), `src/app/(student)/schedule/page.tsx` (ссылки «‹ ›» и полоса дней — `nav-back`/`nav-forward` по сравнению дат), `src/app/globals.css` (кривые и reduced-motion), `src/ui/SwipePane.tsx` (только проверить: `router.push` без `transitionTypes`)
- Test: `tests/ui/transitions.test.tsx`

**Interfaces:** Produces: `navDirection(fromKey: string, toKey: string): "nav-forward" | "nav-back" | null` в `src/ui/student/schedule-params.ts`.

- [ ] **Step 1: Failing tests:** `navDirection("2026-11-17","2026-11-18")` → `"nav-forward"`, обратное → `"nav-back"`, одинаковые → `null`; `template.tsx` групп рендерит `ViewTransition` с `default="none"` и картами `enter`/`exit` для типов `nav-forward`, `nav-back`, `section` (проверка по пропсам дерева React или по исходному тексту, если рендер `ViewTransition` в тестовой среде невозможен); в `globals.css` есть `::view-transition-old(.nav-forward)` / `-new` и `.section`, и `@media (prefers-reduced-motion: reduce)` с `animation: none` для `::view-transition-*`; в `SwipePane.tsx` вызов `router.push` без `transitionTypes`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/transitions.test.tsx` → FAIL.
- [ ] **Step 3: Implement:** `template.tsx` (а не `layout`: шаблон пересоздаётся при переходе, поэтому enter/exit срабатывают; если в Next 16.4 это не так — обернуть содержимое каждой страницы группы тем же компонентом `PageTransition` и записать это в отчёт); `NavLink` — `transitionTypes={["section"]}`; ссылки расписания — `transitionTypes` из `navDirection`; CSS: `section` — растворение 150 мс, `nav-forward/back` — сдвиг 24–40 px + растворение до 250 мс.
- [ ] **Step 4: Run** `npx vitest run tests/ui` и `npx tsc --noEmit` и `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(motion): переходы — сдвиг дня и недели по направлению, растворение между разделами`.

### Task 6: Сквозная проверка, доступность

**Files:**
- Create: `e2e/app-feel.spec.ts`
- Modify: `e2e/a11y.spec.ts`, `e2e/theme.spec.ts` (состояние «Сегодня» с блоком в обеих темах)

- [ ] **Step 1: e2e** (360 и 1280): «Сегодня» — первый блок под заголовком — «Следующая пара» или «Идёт сейчас»/«На сегодня всё»/«Следующая пара — …», он выше плашки деканата; нажатие ведёт на `/schedule?date=`; `page.clock.install` на 10:15 МСК буднего дня → «Идёт сейчас», `clock.fastForward` на 20 мин → состояние сменилось без перезагрузки (Review Focus 3); `GET /manifest.webmanifest` 200 с `short_name` «На связи», `GET /apple-icon.png` 200 `image/png`; в «Парах → День» перед нажатием «›» обернуть `document.startViewTransition` счётчиком — после нажатия счётчик > 0 (если браузер поддерживает), после свайпа пальцем (как в `e2e/swipe.spec.ts`, только 360) — 0 (Review Focus 1); раскрыть и закрыть пару дважды подряд (Review Focus 5); с `test.use({ reducedMotion: "reduce" })` после раскрытия пары и открытия «Учёбы» `document.getAnimations().length === 0`.
- [ ] **Step 2: axe** на «Сегодня» с блоком в светлой и тёмной теме.
- [ ] **Step 3: Run** `npm test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit` → всё зелёное.
- [ ] **Step 4: Commit** `test(e2e): блок следующей пары, манифест, переходы без двойной анимации, reduced-motion`.
- [ ] **Step 5 (контроллер):** снимки «Сегодня» до пары и во время пары (через `page.clock`), 360 и 1280, светлая и тёмная; показать автору; запись в `docs/process/LOG.md`. На сервер — только после одобрения.
