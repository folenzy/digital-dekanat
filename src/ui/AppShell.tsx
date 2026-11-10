import Link from "next/link";
import type { ReactNode } from "react";
import { Bell } from "./Bell";
import { BottomNav } from "./BottomNav";
import { ConceptBanner } from "./ConceptBanner";
import { LiveEvents } from "./live/LiveEvents";
import { Logo } from "./Logo";
import { bellHref, navItems, type ShellRole } from "./nav";
import { SideNav } from "./SideNav";
import styles from "./AppShell.module.css";

// Оболочка кабинета. Рендерится на сервере из layout: роль, имя и число непрочитанных берутся из сессии там же.
// Телефон: пометка концепта, шапка (логотип, колокольчик), нижняя навигация.
// ≥ 1024 px: боковая навигация, контент по центру (до 720 px). <main id="main"> — здесь, страницы его не добавляют.

type AppShellProps = {
  role: ShellRole;
  /** Как показывать человека: «Алина Миронова». */
  userName: string;
  /** Непрочитанные уведомления на момент рендера (unreadCount из src/server/notifications.ts). */
  unread: number;
  children: ReactNode;
  /** Подключать поток событий /api/events (тосты, счётчик). false — для страниц без сессии. */
  live?: boolean;
};

export function AppShell({ role, userName, unread, children, live = true }: AppShellProps) {
  const home = navItems(role)[0].href;
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Перейти к содержимому
      </a>
      <ConceptBanner />
      <div className={styles.frame}>
        <SideNav role={role} userName={userName} unread={unread} />
        <div className={styles.column}>
          <header className={styles.header}>
            <Link href={home} className={styles.brand}>
              <Logo />
            </Link>
            <Bell key={unread} initial={unread} href={bellHref(role)} />
          </header>
          <main id="main" className={styles.main} tabIndex={-1}>
            <div className={styles.content}>{children}</div>
          </main>
        </div>
      </div>
      <BottomNav role={role} />
      {live && <LiveEvents />}
    </div>
  );
}
