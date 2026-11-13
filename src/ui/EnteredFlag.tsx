"use client";

import { useEffect } from "react";

// Каскад появления блоков на «Сегодня» — только при первом открытии кабинета (см. today.module.css):
// через секунду ставим на <html> отметку, и при переходах между разделами блоки больше не «всплывают».

export function EnteredFlag() {
  useEffect(() => {
    const entered = window.setTimeout(() => document.documentElement.setAttribute("data-entered", ""), 900);
    return () => window.clearTimeout(entered);
  }, []);
  return null;
}
