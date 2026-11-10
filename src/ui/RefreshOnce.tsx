"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Карточка только что пометила прочитанными уведомления об этом обращении, а колокольчик живёт в layout,
// который при переходе внутри кабинета не перерисовывается. Один refresh() — и счётчик точный.
// После него сервер уже ничего не помечает, компонент не рендерится — цикла нет.
export function RefreshOnce() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
