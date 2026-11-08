"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { AppealKind, AppealTopic, AppealTypeCode } from "@/server/appeals/types";
import type { AppealDiscipline } from "@/server/grades";
import { FORMAT_LABEL, textLabel } from "@/ui/appeals/labels";
import { Button } from "@/ui/Button";
import { Field, fieldAria, FieldGroup } from "@/ui/Field";
import fs from "@/ui/Field.module.css";
import { createAppealAction } from "../actions";
import styles from "./new.module.css";

// Шаг 3 мастера: короткая форма под подтип. Проверяет сервер (тексты ошибок по-русски у полей),
// поэтому noValidate: браузерные подсказки были бы на языке системы. Пока отправка идёт, кнопка заблокирована.

type AppealFormProps = {
  type: AppealTypeCode;
  kind: AppealKind;
  topic: AppealTopic;
  initial: Record<string, string>;
  /** Для пересдачи: свои дисциплины (долги и текущий семестр). */
  disciplines?: AppealDiscipline[];
  destinationPlaceholder: string;
  /** «Уйдёт в: … · ответ до …» — считается на сервере. */
  slip: ReactNode;
};

const COPIES = ["1", "2", "3", "4", "5"];

export function AppealForm({ type, kind, topic, initial, disciplines, destinationPlaceholder, slip }: AppealFormProps) {
  const [state, formAction, pending] = useActionState(createAppealAction, null);
  // Поля управляемые: React сбрасывает форму после действия, а введённое при ошибке должно остаться.
  const [values, setValues] = useState(() => state?.values ?? initial);
  const form = useRef<HTMLFormElement>(null);
  const errors = state?.fieldErrors ?? {};
  const set = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
  };

  // После ошибки — фокус на первое поле с ошибкой (или на общий текст ошибки).
  useEffect(() => {
    if (!state) return;
    const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error]');
    target?.focus();
  }, [state]);

  const debts = disciplines?.filter((d) => d.debt) ?? [];
  const current = disciplines?.filter((d) => !d.debt) ?? [];

  return (
    <form ref={form} action={formAction} noValidate className={styles.form} data-surface="paper">
      <input type="hidden" name="typeCode" value={type} />

      {topic === "certificates" ? (
        <>
          <Field id="f-destination" label="Куда нужна справка" error={errors.destination}>
            <input
              id="f-destination"
              name="destination"
              className={fs.input}
              value={values.destination ?? ""}
              onChange={set("destination")}
              maxLength={120}
              placeholder={destinationPlaceholder}
              autoComplete="off"
              {...fieldAria("f-destination", { error: errors.destination })}
            />
          </Field>
          <Field id="f-copies" label="Сколько экземпляров" error={errors.copies}>
            <select
              id="f-copies"
              name="copies"
              className={fs.select}
              value={values.copies ?? "1"}
              onChange={set("copies")}
              {...fieldAria("f-copies", { error: errors.copies })}
            >
              {COPIES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <FieldGroup id="f-format" legend="Формат" error={errors.format}>
            {(["paper", "electronic"] as const).map((f) => (
              <label key={f} className={fs.option}>
                <input type="radio" name="format" value={f} checked={values.format === f} onChange={set("format")} />
                {FORMAT_LABEL[f]}
              </label>
            ))}
          </FieldGroup>
          <Field
            id="f-comment"
            label="Комментарий"
            optional
            hint="Например, если нужна справка по особой форме."
            error={errors.comment}
          >
            <textarea
              id="f-comment"
              name="comment"
              className={fs.textarea}
              rows={3}
              maxLength={500}
              value={values.comment ?? ""}
              onChange={set("comment")}
              {...fieldAria("f-comment", { hint: true, error: errors.comment })}
            />
          </Field>
        </>
      ) : (
        <>
          {disciplines && (
            <Field id="f-discipline" label="Дисциплина" optional error={errors.disciplineId}>
              <select
                id="f-discipline"
                name="disciplineId"
                className={fs.select}
                value={values.disciplineId ?? ""}
                onChange={set("disciplineId")}
                {...fieldAria("f-discipline", { error: errors.disciplineId })}
              >
                <option value="">Не выбрана</option>
                {debts.length > 0 && (
                  <optgroup label="Долги">
                    {debts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                  </optgroup>
                )}
                {current.length > 0 && (
                  <optgroup label="Текущий семестр">
                    {current.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                  </optgroup>
                )}
              </select>
            </Field>
          )}
          <Field
            id="f-text"
            label={textLabel(kind)}
            hint="Пара предложений: что случилось и что нужно от деканата."
            error={errors.text}
          >
            <textarea
              id="f-text"
              name="text"
              className={fs.textarea}
              rows={6}
              maxLength={2000}
              value={values.text ?? ""}
              onChange={set("text")}
              {...fieldAria("f-text", { hint: true, error: errors.text })}
            />
          </Field>
        </>
      )}

      {slip}

      {state?.error && (
        <p className={styles.formError} role="alert" tabIndex={-1} data-form-error="">
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending} icon={<Send />} full>
        Отправить
      </Button>
    </form>
  );
}
