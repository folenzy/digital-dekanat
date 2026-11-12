import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./SettingsList.module.css";

// Строки настроек профиля: значок, название, текущее значение и стрелка. Каждая строка — ссылка на свою страницу.

export type SettingsRow = {
  href: string;
  icon: ReactNode;
  label: string;
  /** Текущее значение справа: «Английский», «не выбран». */
  value?: string;
  /** Точка «не заполнено». */
  attention?: boolean;
};

export function SettingsList({ rows, label }: { rows: SettingsRow[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className={styles.list} data-surface="paper">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className={styles.row}>
              <span className={styles.icon} aria-hidden="true">
                {r.icon}
                {r.attention && <span className={styles.dot} />}
              </span>
              <span className={styles.label}>
                {r.label}
                {r.attention && <span className="sr-only"> — не заполнено</span>}
              </span>
              {r.value && <span className={styles.value}>{r.value}</span>}
              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Шапка страницы настройки: ссылка «назад в профиль», заголовок и пояснение. */
export function SettingsPage({ backHref, title, lead, children }: {
  backHref: string; title: string; lead?: ReactNode; children: ReactNode;
}) {
  return (
    <>
      <p className={styles.back}>
        <Link href={backHref}>
          <ChevronLeft aria-hidden="true" />
          Профиль
        </Link>
      </p>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </header>
      {children}
    </>
  );
}
