import type { ReactNode } from "react";
import styles from "./Badge.module.css";

// Небольшая плашка статуса. Цвет всегда дублируется словом (и иконкой) — не только цветом.

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "accent" | "neutral";

type BadgeProps = {
  tone?: BadgeTone;
  icon?: ReactNode;
  /** Обычное состояние: текст без подложки. Подложку получает только то, что требует действия. */
  quiet?: boolean;
  children: ReactNode;
};

export function Badge({ tone = "neutral", icon, quiet = false, children }: BadgeProps) {
  return (
    <span className={styles.badge} data-tone={tone} data-quiet={quiet || undefined}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
