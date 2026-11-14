import { Skeleton } from "./Skeleton";
import styles from "./PageSkeleton.module.css";

// Заготовки для loading.tsx: повторяют форму экрана, пока сервер собирает данные. Детали — те же, что в
// системе «Ведомость» (DESIGN.md): строки через линию, группа строк в рамке, рамка только у пары и у формы.
// О загрузке скринридеру сообщает один раз заголовок страницы; остальные детали молчат (aria-hidden).

const TITLE_WIDTHS = ["72%", "58%", "84%", "64%", "76%", "52%"];
const LINE_WIDTHS = ["46%", "62%", "38%", "54%"];

/** Заголовок страницы: надзаголовок, h1, подзаголовок. Сообщает «Загружаем…» — один раз на страницу. */
export function HeaderSkeleton({
  kicker = false, subtitle = true, subtitleLines = 1,
}: { kicker?: boolean; subtitle?: boolean; subtitleLines?: number }) {
  return (
    <>
      <p role="status" className="sr-only">Загружаем…</p>
      <div className={styles.header} aria-hidden="true">
        {kicker && <Skeleton width="38%" height="0.875rem" />}
        <Skeleton width="62%" height="2rem" radius="6px" />
        {subtitle && Array.from({ length: subtitleLines }, (_, i) => (
          <Skeleton key={i} width={i === subtitleLines - 1 ? "70%" : "94%"} height="1rem" />
        ))}
      </div>
    </>
  );
}

/** Вкладки: утопленная дорожка, радиус 8. small — короткий переключатель не на всю ширину. */
export function TabsSkeleton({ small = false }: { small?: boolean }) {
  return <Skeleton width={small ? "60%" : "100%"} height="44px" radius="8px" className={styles.tabs} />;
}

/** Заголовок раздела h2. */
export function SectionTitleSkeleton() {
  return <Skeleton width="40%" height="1.25rem" className={styles.sectionTitle} />;
}

/** Полоса дней недели на «Парах»: шесть листков. */
export function StripSkeleton() {
  return (
    <div className={styles.strip} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height="64px" radius="8px" />)}
    </div>
  );
}

/** Одна строка текста — сводка над таблицей, строка поиска и т. п. */
export function LineSkeleton({ width = "64%" }: { width?: string }) {
  return <Skeleton width={width} height="1rem" className={styles.line} />;
}

type RowsProps = {
  count?: number;
  /** Строк текста в записи: заголовок и (lines − 1) строк под ним. */
  lines?: number;
  /** Колонка времени слева — лента дня на «Сегодня». */
  time?: boolean;
  /** Группа строк в рамке (предметы «Учёбы», настройки, таблица очереди); без — строки через линию на поле. */
  framed?: boolean;
};

/** Строки через линию — главный способ показа списков в системе. */
export function RowsSkeleton({ count = 3, lines = 2, time = false, framed = false }: RowsProps) {
  return (
    <div className={styles.rows} data-framed={framed || undefined} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.row} data-skeleton-row="">
          {time && (
            <div className={styles.time} data-skeleton-time="">
              <Skeleton width="2.5rem" height="1rem" />
              <Skeleton width="2.25rem" height="0.8125rem" />
            </div>
          )}
          <div className={styles.rowBody}>
            <Skeleton width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} height="1rem" />
            {Array.from({ length: Math.max(0, lines - 1) }, (_, j) => (
              <Skeleton key={j} width={LINE_WIDTHS[(i + j) % LINE_WIDTHS.length]} height="0.8125rem" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Блоки в рамке — только там, где рамка есть и на экране: пары в «Парах», формы. */
export function CardsSkeleton({ count = 1, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div className={styles.cards} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton width="30%" height="0.875rem" />
          <Skeleton width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} height="1.125rem" />
          {Array.from({ length: Math.max(0, lines - 1) }, (_, j) => (
            <Skeleton key={j} width={LINE_WIDTHS[(i + j) % LINE_WIDTHS.length]} height="0.8125rem" />
          ))}
        </div>
      ))}
    </div>
  );
}
