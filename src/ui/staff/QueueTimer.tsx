"use client";

import { shortCountdown } from "../appeals/time-left";
import { useNow } from "../appeals/use-now";
import styles from "./QueueCard.module.css";

// Таймер на корешке талона: «осталось / 21 ч», «просрочено на / 2 ч». Тикает раз в минуту;
// когда срок проходит при открытой странице, сам краснеет (data-overdue).

export function QueueTimer({ due, serverNow }: { due: string; serverNow: string }) {
  const now = useNow(serverNow);
  const t = shortCountdown(new Date(due), now);
  return (
    <time className={styles.timer} dateTime={due} data-overdue={t.overdue || undefined}>
      <span className={styles.timerLabel}>{t.label}</span>{" "}
      <span className={styles.timerValue}>{t.value}</span>
    </time>
  );
}
