import type { ReactNode } from "react";
import styles from "./Section.module.css";

// Блок страницы: заголовок h2 (Literata) и, если нужно, ссылка справа («Все пары»).

type SectionProps = {
  title: ReactNode;
  /** Ссылка/кнопка справа от заголовка. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({ title, action, children, className }: SectionProps) {
  return (
    <section className={[styles.section, className].filter(Boolean).join(" ")}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      {children}
    </section>
  );
}
