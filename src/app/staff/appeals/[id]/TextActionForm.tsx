"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/Button";
import { Field, fieldAria } from "@/ui/Field";
import fs from "@/ui/Field.module.css";
import type { StaffActionState } from "../../form-state";
import styles from "./appeal.module.css";

// Форма «одно текстовое поле + кнопка»: ответ студенту, вопрос-уточнение. После успеха поле очищается,
// карточка перерисовывается сервером; при ошибке текст остаётся, фокус — в поле.

type TextActionFormProps = {
  appealId: string;
  action: (prev: StaffActionState, form: FormData) => Promise<StaffActionState>;
  /** Имя поля в форме и ключ ошибки в Result (text, question). */
  name: string;
  id: string;
  label: string;
  hint?: ReactNode;
  submit: string;
  icon: ReactNode;
  max: number;
  rows?: number;
  sentText: string;
};

export function TextActionForm({ appealId, action, name, id, label, hint, submit, icon, max, rows = 3, sentText }: TextActionFormProps) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: StaffActionState, form: FormData) => {
    const res = await action(prev, form);
    if (res?.ok) setText("");
    return res;
  }, null);
  const failed = state && !state.ok ? state : null;
  const error = failed?.fieldErrors[name];

  useEffect(() => {
    if (failed) area.current?.focus();
  }, [failed]);

  return (
    <form action={formAction} noValidate className={styles.textForm}>
      <input type="hidden" name="appealId" value={appealId} />
      <Field id={id} label={label} hint={hint} error={error}>
        <textarea
          ref={area}
          id={id}
          name={name}
          className={fs.textarea}
          rows={rows}
          maxLength={max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          {...fieldAria(id, { hint: Boolean(hint), error })}
        />
      </Field>
      {failed?.error && <p className={styles.formError} role="alert">{failed.error}</p>}
      <div className={styles.formActions}>
        {text.length > max - 200 && <span className={styles.counter}>{text.length} из {max}</span>}
        <Button type="submit" loading={pending} icon={icon} variant="primary">{submit}</Button>
      </div>
      <p className="sr-only" role="status">{state?.ok ? sentText : ""}</p>
    </form>
  );
}
