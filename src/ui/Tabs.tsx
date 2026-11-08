import Link from "next/link";
import styles from "./Tabs.module.css";

// Вкладки-ссылки: состояние живёт в адресе (?tab=…), работают без JS, их можно отправить ссылкой.
// Текущая вкладка — aria-current="page".

export type TabItem = { href: string; label: string; current: boolean; count?: number };

type TabsProps = {
  /** Подпись навигации для скринридера: «Разделы учёбы». */
  label: string;
  items: TabItem[];
  /** small — вторичный переключатель (фильтр внутри вкладки). */
  size?: "md" | "small";
};

export function Tabs({ label, items, size = "md" }: TabsProps) {
  return (
    <nav aria-label={label} className={styles.tabs} data-size={size}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href} className={styles.item}>
            <Link
              href={item.href}
              className={styles.link}
              aria-current={item.current ? "page" : undefined}
              scroll={false}
            >
              {item.label}
              {/* число дублирует счётчик колокольчика, у которого есть подпись для скринридера */}
              {item.count ? <span className={styles.count} aria-hidden="true">{item.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
