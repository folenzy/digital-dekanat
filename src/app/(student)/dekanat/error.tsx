"use client";

import { ErrorState } from "@/ui/ErrorState";

// retry() перезапрашивает данные сегмента (Next 16), а не просто перерисовывает ошибку.
export default function DekanatError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить «Деканат»" retry={retry} />;
}
