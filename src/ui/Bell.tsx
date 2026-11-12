"use client";

import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveEventDetail } from "./live/LiveEvents";
import styles from "./Bell.module.css";

// Колокольчик со счётчиком непрочитанных. Стартует с числа с сервера и прибавляет по событию `ns:live`.
// После router.refresh() сервер присылает новое `unread`; оболочка рендерит <Bell key={unread}>,
// поэтому счётчик пересоздаётся с точным значением из БД.

/** Уведомление и объявление создают строку в notifications; простое обновление обращения — нет. */
export function countsAsUnread(e: Pick<LiveEventDetail, "type">): boolean {
  return e.type === "notification" || e.type === "announcement";
}

export function badgeText(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

export function bellLabel(n: number): string {
  if (n <= 0) return "Уведомления, новых нет";
  const word = n % 10 === 1 && n % 100 !== 11 ? "непрочитанное" : "непрочитанных";
  return `Уведомления: ${n} ${word}`;
}

type BellProps = {
  initial: number;
  href: string;
  /** Подпись «Уведомления» рядом (боковая навигация). */
  withLabel?: boolean;
};

export function Bell({ initial, href, withLabel = false }: BellProps) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const onLive = (e: Event) => {
      const detail = (e as CustomEvent<LiveEventDetail>).detail;
      if (detail && countsAsUnread(detail)) setCount((c) => c + 1);
    };
    window.addEventListener("ns:live", onLive);
    return () => window.removeEventListener("ns:live", onLive);
  }, []);

  const badge = badgeText(count);
  // Значок: у иконки — счётчик на её углу; в строке с подписью — счётчик в конце строки.
  const counter = badge && (
    <span key={badge} className={styles.badge} aria-hidden="true">
      {badge}
    </span>
  );
  if (withLabel) {
    return (
      <Link href={href} className={styles.row} aria-label={bellLabel(count)}>
        <BellIcon aria-hidden="true" className={styles.rowIcon} />
        <span aria-hidden="true">Уведомления</span>
        {badge && <span key={badge} className={styles.badge} aria-hidden="true" data-count={badge} />}
      </Link>
    );
  }
  return (
    <Link href={href} className={styles.bell} aria-label={bellLabel(count)}>
      <span className={styles.glyph}>
        <BellIcon aria-hidden="true" />
        {counter}
      </span>
    </Link>
  );
}
