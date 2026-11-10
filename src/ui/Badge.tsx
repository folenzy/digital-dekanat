import type { ReactNode } from "react";
import styles from "./Badge.module.css";

// Небольшая плашка статуса. Цвет всегда дублируется словом (и иконкой) — не только цветом.

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "accent" | "neutral";

export function Badge({ tone = "neutral", icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
