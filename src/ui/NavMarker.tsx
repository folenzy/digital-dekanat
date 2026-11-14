"use client";

import { usePathname } from "next/navigation";
import { activeHref } from "./nav";
import styles from "./BottomNav.module.css";

// Закладка над активным разделом нижней панели. Одна на всю панель; при смене раздела встаёт на новое
// место сразу, без переезда.

export function NavMarker({ hrefs }: { hrefs: readonly string[] }) {
  const index = hrefs.indexOf(activeHref(usePathname(), hrefs) ?? "");
  return (
    <span
      aria-hidden="true"
      className={styles.marker}
      data-hidden={index === -1 || undefined}
      style={{ width: `${100 / hrefs.length}%`, transform: `translateX(${Math.max(index, 0) * 100}%)` }}
    />
  );
}
