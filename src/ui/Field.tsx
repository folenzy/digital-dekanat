import type { ReactNode } from "react";
import styles from "./Field.module.css";

// Поле формы: подпись, само поле (input/select/textarea с классами из Field.module.css), подсказка и ошибка.
// Связи для скринридера — через fieldAria(): aria-invalid и aria-describedby на подсказку и ошибку.

type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
};

export function fieldAria(id: string, opts: { hint?: boolean; error?: string }) {
  const ids = [opts.hint && `${id}-hint`, opts.error && `${id}-error`].filter(Boolean).join(" ");
  return { "aria-invalid": opts.error ? (true as const) : undefined, "aria-describedby": ids || undefined };
}

export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> необязательно</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
      {error && <p id={`${id}-error`} className={styles.error}>{error}</p>}
    </div>
  );
}

/** Группа переключателей (radio): подпись — legend. */
export function FieldGroup({ id, legend, error, children }: { id: string; legend: ReactNode; error?: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.options}>{children}</div>
      {error && <p id={`${id}-error`} className={styles.error}>{error}</p>}
    </fieldset>
  );
}
