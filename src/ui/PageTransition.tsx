import { ViewTransition, type ReactNode } from "react";

// Обёртка перехода между экранами (React <ViewTransition> + View Transitions API браузера).
// default="none": анимируется только то, что назвали типом ссылки — nav-forward/nav-back (листание дня и недели),
// section (смена раздела). Переход без типа — браузерная «назад», refresh — идёт без анимации.
// Листание пальцем идёт без типа: ViewTransition есть, но анимации нет — лист уже двигался за пальцем.
// Сам стиль (сдвиг, растворение, reduced-motion) — в globals.css. Где API нет, экран меняется сразу.
const byType = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "section": "section",
  "default": "none",
} as const;

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={byType} exit={byType} default="none">
      {children}
    </ViewTransition>
  );
}
