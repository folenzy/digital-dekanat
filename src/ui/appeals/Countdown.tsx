"use client";

import { useEffect, useState } from "react";
import { countdown } from "./time-left";

// Живой обратный отсчёт до срока: раз в минуту пересчитывается. Первый кадр — по серверному «сейчас»
// (иначе разметка сервера и клиента разойдётся), дальше — по часам браузера.
// Просрочка помечена data-overdue (красный цвет задаёт стиль страницы) и словом «просрочено».

type CountdownProps = {
  /** Срок, ISO-строка. */
  due: string;
  /** «Сейчас» на сервере в момент рендера, ISO-строка. */
  serverNow: string;
  className?: string;
};

export function Countdown({ due, serverNow, className }: CountdownProps) {
  const [now, setNow] = useState(() => new Date(serverNow));

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const { text, overdue } = countdown(new Date(due), now);
  return (
    <time className={className} dateTime={due} data-overdue={overdue || undefined}>
      {text}
    </time>
  );
}
