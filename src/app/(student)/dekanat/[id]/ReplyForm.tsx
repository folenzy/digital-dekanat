"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { APPEAL_TEXT_LIMITS } from "@/server/appeals/types";
import { Button } from "@/ui/Button";
import { Field, fieldAria } from "@/ui/Field";
import fs from "@/ui/Field.module.css";
import { postMessageAction } from "../actions";
import type { MessageFormState } from "../form-state";
import styles from "./appeal.module.css";

// Сообщение в переписку обращения. mode="answer" — ответ на уточнение деканата (выделен на карточке).
// После отправки поле очищается, карточка перерисовывается сервером; при ошибке текст остаётся.

const MAX = APPEAL_TEXT_LIMITS.message;

export function ReplyForm({ appealId, mode }: { appealId: string; mode: "message" | "answer" }) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: MessageFormState, form: FormData) => {
    const res = await postMessageAction(prev, form);
    if (res?.ok) setText("");
    return res;
  }, null);
  const error = state && !state.ok ? state.error : undefined;
  const id = mode === "answer" ? "reply-answer" : "reply-message";

  useEffect(() => {
    if (state && !state.ok) area.current?.focus();
  }, [state]);

  return (
    <form action={formAction} noValidate className={styles.reply} data-mode={mode} data-surface="paper">
      <input type="hidden" name="appealId" value={appealId} />
      <Field id={id} label={mode === "answer" ? "Твой ответ" : "Сообщение"} error={error}>
        <textarea
          ref={area}
          id={id}
          name="text"
          className={fs.textarea}
          rows={mode === "answer" ? 4 : 3}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          {...fieldAria(id, { error })}
        />
      </Field>
      <div className={styles.replyActions}>
        {text.length > MAX - 200 && <span className={styles.counter}>{text.length} из {MAX}</span>}
        <Button type="submit" loading={pending} icon={<Send />} variant={mode === "answer" ? "primary" : "secondary"}>
          {mode === "answer" ? "Ответить" : "Отправить"}
        </Button>
      </div>
      <p className="sr-only" role="status">{state?.ok ? "Сообщение отправлено" : ""}</p>
    </form>
  );
}
