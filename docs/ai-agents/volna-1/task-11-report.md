# Task 11 — Дизайн-система «Бумага» и оболочка приложения: отчёт

**Статус:** DONE_WITH_CONCERNS (замечания ниже, ни одно не блокирует Task 12–14)
**Модель:** Claude Opus 5.5. Скилл `frontend-design` вызван первым.

## Коммиты (ветка feat/volna-1, не запушено)
- `49bb66f` feat(ui): токены «Бумага» и проверка контраста WCAG
- `3b52222` feat(ui): дизайн-система «Бумага», логотип, оболочка
- `b910ae1` chore(e2e): Playwright и npm start запускают standalone-сборку

## Проверки (последний прогон)
- `npm test` → **24 files, 262 passed** (из них новые: tests/ui — 57 тестов в 3 файлах).
- `npm run build` → OK; `npx tsc --noEmit` → чисто; `npx eslint .` → чисто.
- Playwright (временный spec витрины, 2 проекта × 2 теста) → **4 passed**: на 360 и 1280 `scrollWidth <= clientWidth`, шрифты Literata и Golos загружены с кириллическим подмножеством (`unicodeRange` содержит `U+400-45F`), зоны нажатия навигации ≥ 44×44, `aria-current="page"` у активного раздела, без ошибок в консоли (кроме 404 предзагрузки разделов, которых ещё нет — см. замечания).

## TDD
- **RED 1:** `npx vitest run tests/ui/contrast.test.ts` → `Error: ENOENT: no such file or directory, open '...src\ui\tokens.css'` (ожидаемо: токенов ещё нет).
- **GREEN 1:** после `src/ui/tokens.css` → `Tests 33 passed (33)`.
  Ещё до кода расчёт показал, какие пары из брифа проваливаются: `--muted` на `--bg` = 4,18; `--accent` на `--bg` = 4,29; белый на `--accent-2` (кнопка-«чип» макета) = 3,01. Поэтому добавлены `--muted-strong`, `--accent-strong`, а основная кнопка в тёмной карточке — с тёмным текстом на `--accent-2` (5,71).
- **RED 2:** `npx vitest run tests/ui` → `Cannot find package '@/ui/nav'` и `@/ui/AppShell` (модулей нет).
- **GREEN 2:** после компонентов → `Test Files 4 passed, Tests 59 passed` (вместе с прежним tests/live-events-parse.test.ts).

## Дизайн-план (frontend-design) и что изменилось после ревью плана
- **Цвет:** палитра брифа как есть (обложка #F4EFE6, лист #FFFDF8, линовка #E4DCCD, чернила #1D1B17, карандаш #7A7166, терракота #B4552D/#E2774A). Добавлены: синие чернила #2E5272 для кольца фокуса и статуса «Отправлено», статусы мох/охра/кирпич.
- **Шрифты:** Literata (с осью opsz: крупные заголовки получают «дисплейный» рисунок) — заголовки страниц и цифры (время пары, баллы); Golos Text — всё остальное. Шкала 12 · 14 · 16 · 18 · 21 · 24 · 30–42 · 36–48.
- **Раскладка:** телефон — пометка концепта, липкая шапка (знак + колокольчик), колонка 16–24 px, фиксированная нижняя панель; ≥ 1024 — боковая панель 256 px, контент по центру до 720 px.
- **Единственный «смелый» приём — типографика** (крупная Literata). Второй, функциональный — **закладка-ляссе** (терракотовая ленточка с вырезом) отмечает текущий раздел и в нижней, и в боковой навигации.
- **Отличия от «шаблонного» после ревью:** надзаголовки макета были КАПСОМ с разрядкой — сделал строчными (это самый частый признак сгенерированного вида); карточки без теней, только линия; у каждого уровня своё скругление (бейдж 6, поле 12, карточка 16, кнопка — пилюля); тень только у тоста. Тёплый кремовый фон + серифы + терракота сами по себе «типовой» набор, но их зафиксировал бриф и выбрал пользователь, поэтому отличие ищется в деталях.
- **Итерация (черновик сохранён для жюри):** `docs/screenshots/01-design-system-draft-1-{360,1280}.png`. Что исправлено после первого прогона: на десктопе счётчик колокольчика наезжал на подпись «Уведомления» → счётчик переехал в конец строки; на 360 крупное «10:40» сжимало название пары и рвало инициалы «Е. / В.» → сетка «время + название, детали на всю ширину», неразрывные пробелы; заголовок страницы на десктопе был мелковат → `--text-3xl` до 42 px; строка «Уведомления» была темнее остальных пунктов → приглушена как они.

## Токены (`src/ui/tokens.css`)
- Палитра: `--bg --paper --line --ink --muted --accent --accent-2` (значения брифа, тест сверяет их дословно).
- Производные: `--muted-strong #6B6358` (вторичный текст на --bg), `--accent-strong #9E4824` (ссылки/акцентный текст на --bg, текст бейджа «В работе»), `--ink-muted #B8AE9F` (вторичный текст на --ink), `--line-strong #8C8172` (границы полей ввода), `--focus #2E5272`.
- Статусы: `--ok/--ok-tint`, `--warn/--warn-tint`, `--danger/--danger-tint`, `--info/--info-tint`, `--accent-tint`, `--neutral-tint`.
- Шрифты: `--font-display` ("Literata Variable"), `--font-ui` ("Golos Text Variable").
- Кегль: `--text-xs .75rem`, `--text-sm .875rem`, `--text-md 1rem`, `--text-lg 1.125rem`, `--text-xl 1.3125rem`, `--text-2xl 1.5rem`, `--text-3xl clamp(30→42px)`, `--text-display clamp(36→48px)`; `--leading-tight 1.1`, `--leading-snug 1.3`, `--leading-body 1.5`.
- Отступы `--space-1…16` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px); скругления `--radius-sm 6 / -md 12 / -lg 16 / -pill 999`; `--shadow-float`; движение `--dur-fast 120ms`, `--dur 200ms`, `--dur-slow 320ms`, `--ease-out`.
- Раскладка: `--banner-h 28px` (десктоп), `--header-h 56px`, `--nav-h 64px`, `--sidebar-w 256px`, `--content-max 720px`, `--gutter 16px (24px от 600)`, `--tap 44px`.
- **Семантика поверхности (важно для Task 12–14):** компоненты красят текст через `--fg`, `--fg-muted`, `--fg-accent`, `--ring`, `--btn-bg`, `--btn-fg`, `--btn-border`, `--surface`. Атрибут `data-surface="paper"` или `data-surface="ink"` на контейнере подменяет их, и контраст сохраняется автоматически (на фоне страницы `--fg-muted` = `--muted-strong`, на бумаге = `--muted`, на тёмном = `--ink-muted`). Card/ErrorState/SkeletonCard/BottomNav/Toast ставят атрибут сами; свои контейнеры с фоном --paper помечайте `data-surface="paper"`.
- Глобально (`src/app/globals.css`): сброс, h1/h2 — Literata, h3/h4 — Golos 600, ссылки `--fg-accent`, общий `:focus-visible` (2 px `--ring`), `prefers-reduced-motion` гасит анимации и переходы; утилиты `.sr-only`, `.num` (Literata + табличные цифры), `.text-muted`.

## Контраст (WCAG 2.x, считает `tests/ui/contrast.test.ts` из tokens.css)
| Текст/элемент | Фон | Контраст | Минимум | Где |
|---|---|---|---|---|
| --ink | --bg | 15.01 | 4.5 | основной текст на фоне страницы |
| --ink | --paper | 16.91 | 4.5 | основной текст в карточке |
| --muted | --paper | 4.71 | 4.5 | вторичный текст в карточке, подписи нижней навигации |
| --muted-strong | --bg | 5.16 | 4.5 | вторичный текст на фоне страницы (дата, подзаголовок) |
| --muted-strong | --paper | 5.82 | 4.5 | вторичный текст в карточке (запасной) |
| --paper | --ink | 16.91 | 4.5 | текст в тёмной карточке «важное», тост |
| --bg | --ink | 15.01 | 4.5 | пометка «Концепт для конкурса» |
| --ink-muted | --ink | 7.85 | 4.5 | вторичный текст в тёмной карточке |
| --accent | --paper | 4.83 | 4.5 | надзаголовок и ссылка в карточке |
| --accent-strong | --bg | 5.38 | 4.5 | ссылка на фоне страницы |
| --accent-strong | --paper | 6.06 | 4.5 | ссылка в карточке (запасной) |
| --paper | --accent | 4.83 | 4.5 | основная кнопка, счётчик на колокольчике |
| --accent-2 | --ink | 5.71 | 4.5 | надзаголовок и ссылка в тёмной карточке |
| --ink | --accent-2 | 5.71 | 4.5 | основная кнопка в тёмной карточке |
| --ok | --ok-tint | 5.14 | 4.5 | бейдж «Готово» |
| --warn | --warn-tint | 5.05 | 4.5 | бейдж «Нужно уточнение» |
| --danger | --danger-tint | 5.51 | 4.5 | бейдж «Отклонено» |
| --info | --info-tint | 6.50 | 4.5 | бейдж «Отправлено» |
| --accent-strong | --accent-tint | 4.92 | 4.5 | бейдж «В работе» |
| --muted-strong | --neutral-tint | 4.72 | 4.5 | бейдж «Закрыто» |
| --ok | --paper | 6.16 | 4.5 | статусный текст без подложки |
| --warn | --paper | 6.14 | 4.5 | статусный текст без подложки |
| --danger | --paper | 7.01 | 4.5 | «Просрочено» в карточке |
| --danger | --bg | 6.23 | 4.5 | ошибка на фоне страницы |
| --info | --paper | 8.05 | 4.5 | статусный текст без подложки |
| --focus | --bg | 7.15 | 3 | кольцо фокуса на фоне страницы |
| --focus | --paper | 8.05 | 3 | кольцо фокуса в карточке |
| --accent-2 | --ink | 5.71 | 3 | кольцо фокуса в тёмной карточке |
| --line-strong | --paper | 3.76 | 3 | граница поля ввода в карточке |
| --line-strong | --bg | 3.33 | 3 | граница поля ввода на фоне страницы |

Не использовать как текст: `--muted` и `--accent` на `--bg` (4,18 и 4,29), белый/бумагу на `--accent-2` (3,01). `--line` на бумаге 1,34 — только декоративные границы карточек, не поля ввода. Таблица печатается командой `$env:PRINT_CONTRAST="1"; npx vitest run tests/ui/contrast.test.ts --silent=false --reporter=verbose`.

## Контракт AppShell (`src/ui/AppShell.tsx`, серверный компонент)
```ts
AppShell({ role, userName, unread, children, live = true }: {
  role: "student" | "staff";   // ShellRole из src/ui/nav.ts
  userName: string;            // как показать: «Алина Миронова»
  unread: number;              // unreadCount(viewer) на момент рендера
  children: ReactNode;
  live?: boolean;              // монтировать <LiveEvents /> (SSE); false — для страниц без сессии
})
```
- Рисует: ссылку «Перейти к содержимому» → `#main`; `ConceptBanner`; шапку (< 1024: знак-ссылка на первый раздел + `Bell`); `SideNav` (≥ 1024: знак с подписью «цифровой деканат», разделы, строка «Уведомления» со счётчиком, инициалы + имя + «Кабинет студента/сотрудника»); `<main id="main" tabIndex={-1}>` с колонкой до 720 px; `BottomNav` (< 1024, с `env(safe-area-inset-bottom)`; viewport `viewportFit: "cover"`); `<LiveEvents />`.
- **Страницы не добавляют свой `<main>`**, начинают с `<PageHeader>` (единственный h1).
- Разделы: студент — Сегодня `/` · Пары `/schedule` · Учёба `/study` · Деканат `/dekanat` · Профиль `/profile`; сотрудник — Очередь `/staff` · Объявления `/staff/announcements` · Профиль `/staff/profile`. Колокольчик: студент → `/notifications`, сотрудник → `/staff`. Активный раздел — самый длинный совпавший префикс (`/dekanat/<id>` → «Деканат», `/staff/announcements` не подсвечивает «Очередь»), «/» — только точно.
- Счётчик: `Bell` стартует с `unread`, +1 на `ns:live` типов `notification` и `announcement` (у них есть строка в notifications), не на `appeal_updated`. После `router.refresh()` layout перерендерится, `Bell` смонтирован с `key={unread}` и берёт точное число из БД.
- Пример для Task 12:
```tsx
// src/app/(student)/layout.tsx
const v = await requireStudent();
const [p, unread] = await Promise.all([getProfile(v), unreadCount(v)]);
return <AppShell role="student" userName={`${p.firstName} ${p.lastName}`} unread={unread}>{children}</AppShell>;
```

## API компонентов (все в `src/ui/`, CSS Modules, иконки lucide-react)
- `Card({ variant?: "paper"|"ink"|"accent" = "paper", as?: "section"|"article"|"div"|"li" = "section", href?, kicker?, title?, titleAs?: "h2"|"h3"|"p" = "h3", children?, className? })` — `ink` = «важное» (тёмная, не больше одной на экран), `accent` = терракотовая рамка («нужно твоё действие»). С `href` вся карточка — `<Link>`: внутрь не класть других ссылок и кнопок. Тип `CardVariant`.
- `Button(props)` — `variant?: "primary"|"secondary"|"ghost" = "primary"`, `icon?: ReactNode`, `full?: boolean`, `children`, `className?`; как кнопка: `loading?` (блокирует, `aria-busy`, спиннер; против двойного тапа), любые атрибуты `<button>`, `type` по умолчанию `"button"`; с `href` — `<Link>` того же вида (`aria-label?`). Цвета берёт из поверхности: в `ink`-карточке primary = светлая терракота с тёмным текстом. Типы `ButtonProps`, `ButtonVariant`.
- `Badge({ tone?: "ok"|"warn"|"danger"|"info"|"accent"|"neutral" = "neutral", icon?, children })` — для бейджей расписания («Перенос», «Отменена», «Замена преподавателя»), допусков и т. п. Тип `BadgeTone`.
- `StatusBadge({ status: AppealStatus })`, `STATUS_META: Record<AppealStatus, { label, tone, Icon }>`: submitted «Отправлено» (info, Send), in_progress «В работе» (accent, Clock3), needs_info «Нужно уточнение» (warn, MessageCircleQuestionMark), ready «Готово» (ok, CircleCheck), rejected «Отклонено» (danger, CircleX), closed «Закрыто» (neutral, Archive).
- `EmptyState({ icon?: ReactNode, title: string, text?: ReactNode, action?: ReactNode, titleAs?: "h2"|"h3" = "h2" })` — пунктирная рамка, действие обычно `<Button href=…>`.
- `ErrorState({ title? = "Не получилось загрузить", text? = "Сервер не ответил. Проверь интернет и нажми «Повторить».", retry: () => void, retryLabel? = "Повторить" })` — клиентский, `role="alert"`. **Проп назван `retry`, а не `reset`** — см. замечание 1. В error.tsx: `export default function Error({ retry }) { return <ErrorState retry={retry} /> }`.
- `Skeleton({ width? = "100%", height? = "1em", radius?, className? })` (aria-hidden); `SkeletonCard({ lines? = 2, label? = "Загружаем…" })` (`role="status"` + скрытый текст). Анимация «дыхания» отключается при reduced motion.
- `PageHeader({ title, kicker?, subtitle? })` — h1 Literata; `kicker` над заголовком (дата на «Сегодня»), `subtitle` под ним.
- `Toast({ title: string, href?: string, onClose?: () => void })` и `ToastRegion({ children })` (постоянная live-область; на телефоне над нижней панелью, на десктопе справа снизу). Кнопка закрытия `aria-label="Скрыть уведомление"`. `href` должен быть уже проверен (`isSafeHref`).
- `ConceptBanner()`, `CONCEPT_TEXT = "Концепт для конкурса · не официальный сервис"` — поставить и на `/login`.
- `Logo({ size? = 28, wordmark? = true, subtitle? = false, className? })`, `LogoMark({ size? = 28, title? })` — без `title` знак `aria-hidden`, с `title` — `role="img"`. Цвет `currentColor`.
- `Bell({ initial: number, href: string, withLabel?: boolean })`, `countsAsUnread(e)`, `badgeText(n)` («99+»), `bellLabel(n)` (aria-label со склонением).
- `NavLink({ href, hrefs, className?, children })` (клиентский, `aria-current="page"`), `BottomNav({ role })`, `SideNav({ role, userName, unread })`, `initials(name)`; данные разделов — `src/ui/nav.ts`: `navItems(role)`, `bellHref(role)`, `activeHref(pathname, hrefs)`, типы `ShellRole`, `NavItem`, `NavIcon`; иконки — `src/ui/nav-icons.ts`.
- `LiveEvents` теперь показывает `Toast` (новый `key` на каждое событие — анимация появления повторяется), логика SSE не менялась.

## Остальные изменения
- `src/app/layout.tsx`: `@fontsource-variable/literata/opsz.css` + `@fontsource-variable/golos-text/wght.css` (+ tokens.css, globals.css); `lang="ru"`; metadata «На связи — цифровой деканат» (шаблон `%s — На связи`), описание про концепт для конкурса; viewport `themeColor #F4EFE6`, `viewportFit: "cover"`. Без внешних CDN.
- Удалено: Geist/`next/font/google`, `src/app/page.module.css`, демо `page.tsx` (теперь заглушка со знаком и ссылкой «Войти»), `src/app/favicon.ico`, все `public/*.svg` (папки `public/` больше нет). Новый `src/app/icon.svg` — знак на терракотовой плашке.
- Из старого globals.css убран `overflow-x: hidden` на html/body: он прятал бы горизонтальный скролл, который мы проверяем.
- `vitest.config.mts`: `include` → `tests/**/*.test.{ts,tsx}` (разметочные тесты компонентов через `react-dom/server`).
- Витрина `src/app/dekanat/dev-showcase/*` (лежала под `/dekanat/`, чтобы на скриншоте была видна закладка активного раздела) и `e2e/design-system.spec.ts` **удалены** до коммитов; скриншоты остались.

## Скриншоты и как их снимать
Файлы: `docs/screenshots/01-design-system-360.png`, `-1280.png` (окно 360×800 и 1280×800), `-360-full.png`, `-1280-full.png` (вся витрина), `-staff-360.png`, `-staff-1280.png` (навигация сотрудника), `-draft-1-360.png`, `-draft-1-1280.png` (первая итерация).

**Запуск прод-сборки для e2e (решение):** `playwright.config.ts` → `webServer.command = "npm run build && node scripts/start-standalone.mjs 3100"`. `next start` при `output: "standalone"` работает, но пишет «"next start" does not work with "output: standalone"». Скрипт копирует `.next/static` и `public` (если есть) в `.next/standalone/` (как в `node_modules/next/dist/docs/.../output.md`) и запускает `server.js` с `PORT` и `HOSTNAME=127.0.0.1` — так же, как будет в Docker. `npm start` теперь тоже вызывает этот скрипт. Проверено: после прогона Playwright сервер завершается, «сирот» на :3100 нет.

Рецепт спека (для повторения в Task 12+): в тесте `page.setViewportSize({ width, height: 800 })`, `goto`, `await page.evaluate(() => document.fonts.ready)`, проверка `document.documentElement.scrollWidth <= clientWidth`, `page.screenshot({ path })` и для длинного снимка `page.screenshot({ path, fullPage: true, style: 'nav[aria-label="Разделы"] { position: static !important; }' })` — без `style` фиксированная нижняя панель окажется посреди длинного снимка (Chromium снимает без перекладки, `sticky` не помогает). Навигацию искать как `page.getByRole("navigation", { name: "Разделы" })` — на каждой ширине видна только одна из двух.

## Самопроверка
- Прошёл диф: нет `dangerouslySetInnerHTML` и inline `<script>`; inline `style` только для ширин скелетона, сетки нижней панели и заглушки главной.
- Иконки-кнопки подписаны (колокольчик — `aria-label` со счётчиком, закрыть тост), иконки внутри — `aria-hidden`; видимый `:focus-visible` проверен скриншотами с клавиатуры на фоне, бумаге и тёмной карточке; `prefers-reduced-motion` проверен (`animationName: none` у скелетона).
- Найдено и исправлено по ходу: наложение счётчика на подпись (см. итерация), а также сирота-сервер на :3100 от моей же ручной пробы `next start` — Playwright с `reuseExistingServer: true` молча переиспользовал его со старой сборкой (CSS 500). Убил процесс, перепроверил на чистом сервере.
- Первый вариант коммитов случайно включил удаления, ранее застейдженные `git rm`; переложил свои незапушенные коммиты через `git reset --soft` (рабочее дерево не трогал), теперь первый коммит — только токены и тест.

## Замечания (concerns)
1. **ErrorState: проп `retry`, а не `reset`** (отступление от заметки контроллера). В Next 16.4 `error.tsx` получает `retry()` (стабилен с 16.3) — он перезапрашивает данные сегмента; `reset()` лишь перерисовывает и для ошибки загрузки на сервере повторит ту же ошибку (docs: `03-file-conventions/error.md`). Имя `retry` подсказывает Task 12 передать правильную функцию.
2. **Безопасность для Task 16:** `next build` копирует `.env` в `.next/standalone/.env` (видел файл, содержимое не читал). В Docker `.env` не должен попадать в контекст сборки (`.dockerignore`), иначе секреты окажутся в образе.
3. Папки `public/` больше нет — Dockerfile в Task 16 не должен делать `COPY public` (или создать папку). `start-standalone.mjs` отсутствие `public` переживает.
4. `src/app/page.tsx` — временная заглушка; Task 12 должен её удалить, иначе конфликт с `(student)/page.tsx` за маршрут `/`.
5. Пока нет страниц разделов, `<Link>` в навигации предзагружает их с 404 в консоли. Исчезнет после Task 12–14.
6. Literata подключена с осью opsz: кириллица 62 КБ + латиница 110 КБ (без opsz было бы 28 + 52). Выбрал ради рисунка крупных заголовков; если важнее вес — заменить на `wght.css`, одна строка в layout.
7. Пометка концепта на телефоне не липкая: она вверху каждой страницы и уезжает при прокрутке, липкая — шапка. Если «видна на каждом экране» понимать как «всегда на экране», нужен `position: sticky` для пометки (минус 26 px высоты).
8. В спеке на десктопе упомянута «справа колонка Сегодня/уведомления, где уместно» — в оболочке её нет (контент до 720 px по центру). Если Task 12 захочет правую колонку, понадобится опция ширины у AppShell.
9. `LICENSES.md` не создавал (Task 15). Сверено по package.json: Literata и Golos Text — OFL-1.1, lucide-react — **ISC** (открытый вопрос спеки «MIT или ISC» закрыт).
10. Бриф Task 11 перечислял только 13 файлов; по заметкам контроллера добавлены ещё `Button`, `Badge`, `PageHeader`, `Bell`, `NavLink`, `nav.ts`, `nav-icons.ts`, `scripts/start-standalone.mjs` и тесты.
