"use client";

import { ErrorState } from "@/ui/ErrorState";

// retry() перезапрашивает данные сегмента (Next 16), а не просто перерисовывает ошибку.
export default function QueueError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить очередь" retry={retry} />;
}
