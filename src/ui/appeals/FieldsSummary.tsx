import type { AppealDetail } from "@/server/appeals/types";
import { fieldRows } from "./labels";
import styles from "./FieldsSummary.module.css";

// «Что в обращении»: поля с человеческими подписями; значения — как ввёл автор (экранирует React).

export function FieldsSummary({ appeal }: { appeal: Pick<AppealDetail, "fields" | "disciplineName" | "type"> }) {
  const rows = fieldRows(appeal);
  if (!rows.length) return null;
  return (
    <dl className={styles.list} data-surface="paper">
      {rows.map((r) => (
        <div key={r.label} className={styles.row}>
          <dt className={styles.label}>{r.label}</dt>
          <dd className={styles.value}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
