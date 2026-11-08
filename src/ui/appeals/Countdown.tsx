"use client";

import { countdown } from "./time-left";
import { useNow } from "./use-now";

// Живой обратный отсчёт до срока: раз в минуту пересчитывается (useNow).
// Просрочка помечена data-overdue (красный цвет задаёт стиль страницы) и словом «просрочено».

type CountdownProps = {
  /** Срок, ISO-строка. */
  due: string;
  /** «Сейчас» на сервере в момент рендера, ISO-строка. */
  serverNow: string;
  className?: string;
};

export function Countdown({ due, serverNow, className }: CountdownProps) {
  const now = useNow(serverNow);
  const { text, overdue } = countdown(new Date(due), now);
  return (
    <time className={className} dateTime={due} data-overdue={overdue || undefined}>
      {text}
    </time>
  );
}
