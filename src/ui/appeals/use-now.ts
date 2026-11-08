"use client";

import { useEffect, useState } from "react";

// «Сейчас» для живых таймеров: первый кадр — серверное время рендера (иначе разметка сервера и клиента
// разойдётся), дальше — часы браузера раз в минуту.

export function useNow(serverNow: string, everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date(serverNow));

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [everyMs]);

  return now;
}
