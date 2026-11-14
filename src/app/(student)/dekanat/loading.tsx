import { HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";
import { Skeleton } from "@/ui/Skeleton";
import styles from "./dekanat.module.css";

// «Деканат» грузится: поиск по ответам (поле и кнопка), мои обращения строками.
export default function DekanatLoading() {
  return (
    <>
      <HeaderSkeleton subtitleLines={2} />
      <Skeleton width="44%" height="1.25rem" />
      <div className={styles.askRow} aria-hidden="true" style={{ marginTop: "var(--space-3)" }}>
        <Skeleton height="48px" radius="8px" />
        <Skeleton width="96px" height="48px" radius="8px" />
      </div>
      <SectionTitleSkeleton />
      <TabsSkeleton small />
      <RowsSkeleton count={2} lines={2} />
    </>
  );
}
