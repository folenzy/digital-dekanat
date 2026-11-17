"use client";

import { useState, ViewTransition, type ReactNode } from "react";
import { transitionGate } from "./transition-gate";

// Обёртка перехода между экранами (React <ViewTransition> + View Transitions API браузера).
// default="none": анимируется только то, что назвали типом ссылки — nav-forward/nav-back (листание дня и недели),
// section (смена раздела). Переход без типа — браузерная «назад», refresh — идёт без анимации.
// Листание пальцем сюда не попадает вовсе: лист уже двигался за пальцем (transition-gate.ts).
// Сам стиль (сдвиг, растворение, reduced-motion) — в globals.css. Где API нет, экран меняется сразу.
const byType = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "section": "section",
  "default": "none",
} as const;

export function PageTransition({ children }: { children: ReactNode }) {
  // Решаем один раз на лист: иначе смена обёртки пересоздала бы содержимое
  const [animated] = useState(() => !transitionGate.silent);
  if (!animated) return <>{children}</>;
  return (
    <ViewTransition enter={byType} exit={byType} default="none">
      {children}
    </ViewTransition>
  );
}
