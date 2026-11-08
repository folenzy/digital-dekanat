"use client";

import { Hand } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { takeAction } from "../../actions";
import styles from "./appeal.module.css";

// «Взять в работу». Если кто-то успел раньше — «Статус уже изменился», карточка покажет актуальный.
export function TakeForm({ appealId }: { appealId: string }) {
  const [state, formAction, pending] = useActionState(takeAction, null);
  const error = state && !state.ok ? state.error : "";
  return (
    <form action={formAction} className={styles.take}>
      <input type="hidden" name="appealId" value={appealId} />
      <Button type="submit" loading={pending} icon={<Hand />}>Взять в работу</Button>
      {error && <p className={styles.formError} role="alert">{error}</p>}
    </form>
  );
}
