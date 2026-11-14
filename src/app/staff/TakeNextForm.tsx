"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { takeNextAction } from "./actions";
import styles from "./queue.module.css";

// «Взять следующее» — главное действие очереди. Сервер сам выбирает самое срочное новое обращение
// в отделах сотрудника (с учётом фильтра отдела), берёт его в работу и открывает карточку.
// Если брать нечего (или последнее только что взял коллега) — сообщение рядом с кнопкой.
export function TakeNextForm({ dept }: { dept?: number }) {
  const [state, formAction, pending] = useActionState(takeNextAction, null);
  const error = state && !state.ok ? state.error : "";
  return (
    <form action={formAction} className={styles.takeNext}>
      {dept !== undefined && <input type="hidden" name="dept" value={dept} />}
      <Button type="submit" loading={pending}>Взять следующее обращение</Button>
      {error && <p className={styles.takeNextNote} role="status">{error}</p>}
    </form>
  );
}
