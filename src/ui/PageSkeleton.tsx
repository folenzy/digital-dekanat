import { Skeleton, SkeletonCard } from "./Skeleton";
import styles from "./PageSkeleton.module.css";

// Заготовки для loading.tsx: повторяют форму экрана, пока сервер собирает данные.

/** Заголовок страницы: надзаголовок, h1, подзаголовок. */
export function HeaderSkeleton({ kicker = false, subtitle = true }: { kicker?: boolean; subtitle?: boolean }) {
  return (
    <div className={styles.header} aria-hidden="true">
      {kicker && <Skeleton width="38%" height="0.875rem" />}
      <Skeleton width="72%" height="2.25rem" radius="10px" />
      {subtitle && <Skeleton width="90%" height="1rem" />}
    </div>
  );
}

/** Вкладки-переключатель. */
export function TabsSkeleton() {
  return <Skeleton height="50px" radius="999px" className={styles.tabs} />;
}

/** Заголовок блока h2. */
export function SectionTitleSkeleton() {
  return <Skeleton width="44%" height="1.5rem" className={styles.sectionTitle} />;
}

/** Полоса дней недели на «Парах». */
export function StripSkeleton() {
  return <Skeleton height="64px" radius="16px" className={styles.strip} />;
}

/** Стопка карточек; spaced — с отступом снизу (перед вкладками). */
export function CardsSkeleton({ count = 3, lines = 2, spaced = false }: { count?: number; lines?: number; spaced?: boolean }) {
  return (
    <div className={[styles.stack, spaced && styles.spaced].filter(Boolean).join(" ")}>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} lines={lines} />)}
    </div>
  );
}
