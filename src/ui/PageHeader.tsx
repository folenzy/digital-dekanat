import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

// Заголовок страницы — единственный h1 экрана.
// kicker — строка над заголовком, только когда она сообщает то, чего нет в заголовке (шаг мастера);
// subtitle — пояснение под ним.

type PageHeaderProps = { title: ReactNode; kicker?: ReactNode; subtitle?: ReactNode };

export function PageHeader({ title, kicker, subtitle }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {kicker && <p className={styles.kicker}>{kicker}</p>}
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
