import Link from "next/link";
import type { ReactNode } from "react";
import { ConceptBanner } from "./ConceptBanner";
import { Logo } from "./Logo";
import styles from "./PublicPage.module.css";

// Страница без входа (О проекте, 404, общая ошибка): пометка концепта, знак, колонка текста.

export function PublicPage({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>Перейти к содержимому</a>
      <ConceptBanner />
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="На связи — на главную">
          <Logo subtitle />
        </Link>
        {action}
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}
