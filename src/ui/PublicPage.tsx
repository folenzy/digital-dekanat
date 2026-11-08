import Link from "next/link";
import type { ReactNode } from "react";
import { ConceptBanner } from "./ConceptBanner";
import { Logo } from "./Logo";
import styles from "./PublicPage.module.css";

// Страница без входа (О проекте, 404, общая ошибка): пометка концепта, знак, колонка текста.

type PublicPageProps = {
  children: ReactNode;
  action?: ReactNode;
  /** Куда ведёт знак: по умолчанию «/»; 404 для сотрудника передаёт его очередь. */
  home?: string;
};

export function PublicPage({ children, action, home = "/" }: PublicPageProps) {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>Перейти к содержимому</a>
      <ConceptBanner />
      <header className={styles.header}>
        <Link href={home} className={styles.brand} aria-label="На связи цифровой деканат — на главную">
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
