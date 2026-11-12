"use client";

import { usePathname } from "next/navigation";
import { activeHref } from "./nav";
import styles from "./BottomNav.module.css";

// Закладка-ляссе над активным разделом нижней панели. Одна на всю панель: при смене раздела она
// переезжает к нему (transform), а не исчезает в одном месте и появляется в другом.

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
