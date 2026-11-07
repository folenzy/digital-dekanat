import type { ReactNode } from "react";
import styles from "./States.module.css";

// Пустое состояние — не тупик, а подсказка, что сделать дальше: заголовок, пояснение, действие.

type EmptyStateProps = {
  /** Иконка lucide, например <Inbox />. */
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  /** Обычно <Button href=…>. */
  action?: ReactNode;
  titleAs?: "h2" | "h3";
};

export function EmptyState({ icon, title, text, action, titleAs: Title = "h2" }: EmptyStateProps) {
  return (
    <div className={`${styles.state} ${styles.empty}`}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      <Title className={styles.title}>{title}</Title>
      {text && <p className={styles.text}>{text}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
