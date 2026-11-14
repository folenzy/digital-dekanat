import styles from "./ConceptBanner.module.css";

// Пометка из ТЗ: видна на каждом экране и на странице входа.

export const CONCEPT_TEXT = "Концепт для конкурса, не официальный сервис";

export function ConceptBanner() {
  return (
    <p className={styles.banner} data-surface="ink">
      {CONCEPT_TEXT}
    </p>
  );
}
