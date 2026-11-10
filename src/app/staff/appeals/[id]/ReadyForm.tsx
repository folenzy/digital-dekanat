"use client";

import { CircleCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { APPEAL_TEXT_LIMITS } from "@/server/appeals/types";
import { Button } from "@/ui/Button";
import { Field, fieldAria } from "@/ui/Field";
import fs from "@/ui/Field.module.css";
import { markReadyAction } from "../../actions";
import styles from "./appeal.module.css";

// «Готово». Для справки — где и до какого дня забрать (по умолчанию единое окно и +5 дней);
// для остальных видов полей нет: студент увидит статус «Готово», ответ — в переписке.

type ReadyFormProps = {
  appealId: string;
  certificate: boolean;
  /** Значения по умолчанию и границы поля даты, ГГГГ-ММ-ДД (по Москве, посчитаны на сервере). */
  defaultPlace: string;
  defaultUntil: string;
  minUntil: string;
  maxUntil: string;
};

export function ReadyForm({ appealId, certificate, defaultPlace, defaultUntil, minUntil, maxUntil }: ReadyFormProps) {
  const [place, setPlace] = useState(defaultPlace);
  const [until, setUntil] = useState(defaultUntil);
  const [state, formAction, pending] = useActionState(markReadyAction, null);
  const failed = state && !state.ok ? state : null;
  const placeError = failed?.fieldErrors.place;
  const untilError = failed?.fieldErrors.until;

  return (
    <form action={formAction} noValidate className={styles.textForm}>
      <input type="hidden" name="appealId" value={appealId} />
      {certificate ? (
        <div className={styles.pickupFields}>
          <Field id="ready-place" label="Где забрать" error={placeError}>
            <input
              id="ready-place"
              name="place"
              className={fs.input}
              maxLength={APPEAL_TEXT_LIMITS.pickupPlace}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              {...fieldAria("ready-place", { error: placeError })}
            />
          </Field>
          <Field id="ready-until" label="До какого дня" hint="Справку хранят до 17:00 этого дня" error={untilError}>
            <input
              id="ready-until"
              name="until"
              type="date"
              className={fs.input}
              min={minUntil}
              max={maxUntil}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              {...fieldAria("ready-until", { hint: true, error: untilError })}
            />
          </Field>
        </div>
      ) : (
        <p className={styles.formHint}>
          Студент увидит статус «Готово». Если нужно что-то пояснить, напиши ответ в переписке выше.
        </p>
      )}
      {failed?.error && <p className={styles.formError} role="alert">{failed.error}</p>}
      <div className={styles.formActions}>
        <Button type="submit" loading={pending} icon={<CircleCheck />} variant="primary">
          {certificate ? "Отметить готовой" : "Отметить готовым"}
        </Button>
      </div>
    </form>
  );
}
