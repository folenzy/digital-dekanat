"use client";

import { ErrorState } from "@/ui/ErrorState";

// retry() перезапрашивает данные сегмента (Next 16), а не просто перерисовывает ошибку.
export default function StudyError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить успеваемость" retry={retry} />;
}
