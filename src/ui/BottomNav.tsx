import { navItems, type ShellRole } from "./nav";
import { NAV_ICONS } from "./nav-icons";
import { NavLink } from "./NavLink";
import styles from "./BottomNav.module.css";

// Нижняя панель разделов на телефоне (< 1024 px). Активный раздел отмечен закладкой-ляссе.

export function BottomNav({ role }: { role: ShellRole }) {
  const items = navItems(role);
  const hrefs = items.map((i) => i.href);
  return (
    <nav className={styles.nav} aria-label="Разделы" data-surface="paper">
      <ul className={styles.list} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.href}>
              <NavLink href={item.href} hrefs={hrefs} className={styles.link}>
                <Icon aria-hidden="true" className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
