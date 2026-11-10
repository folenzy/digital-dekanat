"use client";

import { CloudOff, RotateCcw } from "lucide-react";
import { Button } from "./Button";
import styles from "./States.module.css";

// Ошибка загрузки: что случилось и что сделать. Для error.tsx в Next 16 передавай `retry` из его пропсов:
// он перезапрашивает данные сегмента (а `reset` только перерисовывает и повторит ту же ошибку).

type ErrorStateProps = {
  title?: string;
  text?: string;
  retry: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = "Не получилось загрузить",
  text = "Сервер не ответил. Проверь интернет и нажми «Повторить».",
  retry,
  retryLabel = "Повторить",
}: ErrorStateProps) {
  return (
    <div className={`${styles.state} ${styles.error}`} role="alert" data-surface="paper">
      <span className={styles.icon} aria-hidden="true"><CloudOff /></span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{text}</p>
      <div className={styles.action}>
        <Button variant="secondary" icon={<RotateCcw />} onClick={() => retry()}>
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
