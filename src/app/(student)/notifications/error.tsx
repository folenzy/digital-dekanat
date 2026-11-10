"use client";

import { ErrorState } from "@/ui/ErrorState";

// retry() перезапрашивает данные сегмента (Next 16), а не просто перерисовывает ошибку.
export default function NotificationsError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить уведомления" retry={retry} />;
}
