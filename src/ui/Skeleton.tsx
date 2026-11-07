import styles from "./Skeleton.module.css";

// Скелетоны для loading.tsx: повторяют форму будущего содержимого, мягко «дышат»;
// при prefers-reduced-motion — неподвижны.

type SkeletonProps = { width?: string; height?: string; radius?: string; className?: string };

export function Skeleton({ width = "100%", height = "1em", radius, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/** Заглушка карточки: надзаголовок, заголовок и `lines` строк текста. Объявляет «Загружаем…» скринридеру. */
export function SkeletonCard({ lines = 2, label = "Загружаем…" }: { lines?: number; label?: string }) {
  const widths = ["92%", "64%", "78%", "50%"];
  return (
    <div className={styles.card} role="status" data-surface="paper">
      <span className="sr-only">{label}</span>
      <Skeleton width="34%" height="0.875rem" />
      <Skeleton width="70%" height="1.25rem" className={styles.title} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height="0.875rem" />
      ))}
    </div>
  );
}
