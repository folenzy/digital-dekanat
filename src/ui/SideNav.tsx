import Link from "next/link";
import { Bell } from "./Bell";
import { Logo } from "./Logo";
import { bellHref, navItems, type ShellRole } from "./nav";
import { NAV_ICONS } from "./nav-icons";
import { NavLink } from "./NavLink";
import styles from "./SideNav.module.css";

// Боковая навигация на десктопе (≥ 1024 px): те же разделы, колокольчик и кто вошёл.

/** «Алина Миронова» → «АМ»; «Миронова Алина Сергеевна» → «МА». */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

type SideNavProps = { role: ShellRole; userName: string; unread: number };

export function SideNav({ role, userName, unread }: SideNavProps) {
  const items = navItems(role);
  const hrefs = items.map((i) => i.href);
  return (
    <aside className={styles.side}>
      <Link href={items[0].href} className={styles.brand}>
        <Logo size={32} subtitle />
      </Link>

      <nav aria-label="Разделы">
        <ul className={styles.list}>
          {items.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            return (
              <li key={item.href}>
                <NavLink href={item.href} hrefs={hrefs} className={styles.link}>
                  <Icon aria-hidden="true" className={styles.icon} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.extra}>
        <Bell key={unread} initial={unread} href={bellHref(role)} withLabel />
      </div>

      <div className={styles.user}>
        <span className={styles.avatar} aria-hidden="true">{initials(userName)}</span>
        <span className={styles.who}>
          <span className={styles.name}>{userName}</span>
          <span className={styles.role}>{role === "student" ? "Кабинет студента" : "Кабинет сотрудника"}</span>
        </span>
      </div>
    </aside>
  );
}
