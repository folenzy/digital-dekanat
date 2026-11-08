"use client";

import { CircleX } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { APPEAL_TEXT_LIMITS } from "@/server/appeals/types";
import { Button } from "@/ui/Button";
import { Field, fieldAria } from "@/ui/Field";
import fs from "@/ui/Field.module.css";
import { rejectAction } from "../../actions";
import type { StaffActionState } from "../../form-state";
import styles from "./appeal.module.css";

// «Отклонить» в два шага, без системных диалогов: первое нажатие проверяет причину и показывает
// подтверждение прямо в форме, второе — отправляет. Пока ждём подтверждения, причина не меняется:
// студент получит ровно тот текст, который сотрудник видел.

const MIN = APPEAL_TEXT_LIMITS.rejectReasonMin;
const MAX = APPEAL_TEXT_LIMITS.rejectReasonMax;

export function RejectForm({ appealId, number }: { appealId: string; number: string }) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState("");
  const start = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: StaffActionState, form: FormData) => {
    const res = await rejectAction(prev, form);
    if (!res?.ok) setConfirming(false);
    return res;
  }, null);
  const failed = state && !state.ok ? state : null;
  const error = localError || failed?.fieldErrors.reason;

  useEffect(() => {
    if (confirming) confirm.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (failed) area.current?.focus();
  }, [failed]);

  const ask = () => {
    if (reason.trim().length < MIN) {
      setLocalError(`Минимум ${MIN} символов`);
      area.current?.focus();
      return;
    }
    setLocalError("");
    setConfirming(true);
  };

  const cancel = () => {
    setConfirming(false);
    // кнопка «Отклонить обращение» появится после перерисовки — вернём фокус на неё
    requestAnimationFrame(() => start.current?.focus());
  };

  return (
    <form action={formAction} noValidate className={styles.textForm}>
      <input type="hidden" name="appealId" value={appealId} />
      <Field id="reject-reason" label="Причина отказа" hint="Студент увидит её в обращении и в уведомлении" error={error}>
        <textarea
          ref={area}
          id="reject-reason"
          name="reason"
          className={fs.textarea}
          rows={3}
          maxLength={MAX}
          value={reason}
          readOnly={confirming}
          onChange={(e) => {
            setReason(e.target.value);
            if (localError) setLocalError("");
          }}
          {...fieldAria("reject-reason", { hint: true, error })}
        />
      </Field>
      {failed?.error && <p className={styles.formError} role="alert">{failed.error}</p>}
      {confirming ? (
        <div className={styles.confirm} role="group" aria-labelledby="reject-confirm-text">
          <p id="reject-confirm-text" className={styles.confirmText}>
            Отклонить обращение {number}? Студент сразу получит уведомление с причиной, вернуть обращение в работу будет нельзя.
          </p>
          <div className={styles.confirmActions}>
            <Button type="button" variant="ghost" onClick={cancel} disabled={pending}>Отмена</Button>
            <Button ref={confirm} type="submit" loading={pending} icon={<CircleX />} className={styles.danger}>
              Да, отклонить
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.formActions}>
          {reason.length > MAX - 100 && <span className={styles.counter}>{reason.length} из {MAX}</span>}
          <Button ref={start} type="button" variant="secondary" icon={<CircleX />} onClick={ask}>
            Отклонить обращение
          </Button>
        </div>
      )}
    </form>
  );
}
