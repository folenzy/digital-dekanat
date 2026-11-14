### Task 11: Дизайн-система «Бумага» и оболочка приложения

**Скилл:** `frontend-design` (обязательно вызвать перед задачей).

**Files:**
- Create: `src/ui/tokens.css`, `src/app/globals.css`, `src/ui/Logo.tsx` (свой SVG: речевой пузырь со стрелкой-ориентиром), `src/ui/AppShell.tsx`, `src/ui/BottomNav.tsx`, `src/ui/SideNav.tsx`, `src/ui/ConceptBanner.tsx`, `src/ui/Card.tsx`, `src/ui/EmptyState.tsx`, `src/ui/Skeleton.tsx`, `src/ui/ErrorState.tsx`, `src/ui/StatusBadge.tsx`, `src/ui/Toast.tsx`, `src/app/icon.svg`
- Modify: `src/app/layout.tsx` (шрифты @fontsource-variable: Literata для заголовков и цифр, Golos Text для интерфейса; `lang="ru"`)

**Interfaces:**
- Токены (спека §11): `--bg #F4EFE6`, `--paper #FFFDF8`, `--line #E4DCCD`, `--ink #1D1B17`, `--muted #7A7166`, `--accent #B4552D`, `--accent-2 #E2774A`, статусы ok, warn, danger в тёплой гамме с контрастом WCAG AA (проверить расчётом).
- `AppShell({role, children})`: мобайл — шапка (логотип, колокольчик со счётчиком) + нижняя навигация «Сегодня · Пары · Учёба · Деканат · Профиль»; ≥1024 px — боковая навигация. `ConceptBanner` в шапке и на `/login`.
- `prefers-reduced-motion` отключает анимации; видимый фокус; у иконок-кнопок есть `aria-label`.

- [ ] **Step 1:** Временная страница-витрина компонентов → скриншоты Playwright 360×800 и 1280×800 → `docs/screenshots/01-design-system-*.png`; проверить отсутствие горизонтального скролла (`scrollWidth <= clientWidth`).
- [ ] **Step 2:** Удалить витрину, commit `feat(ui): дизайн-система «Бумага», логотип, оболочка`.

