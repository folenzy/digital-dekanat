import type { ReactNode } from "react";
import styles from "./Section.module.css";

// Блок страницы: заголовок h2 (Literata) и, если нужно, ссылка справа («Все пары»).
// С id блок становится именованной областью (region) для скринридера: aria-labelledby → заголовок.

type SectionProps = {
  title: ReactNode;
  /** Ссылка/кнопка справа от заголовка. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** id заголовка; секция получает aria-labelledby на него. */
  id?: string;
};

export function Section({ title, action, children, className, id }: SectionProps) {
  return (
    <section className={[styles.section, className].filter(Boolean).join(" ")} aria-labelledby={id}>
      <div className={styles.head}>
        <h2 className={styles.title} id={id}>{title}</h2>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      {children}
    </section>
  );
}
