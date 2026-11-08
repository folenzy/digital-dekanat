"use client";

import { ErrorState } from "@/ui/ErrorState";
import { PublicPage } from "@/ui/PublicPage";

// Ошибка выше страниц (например, в оболочке кабинета). Без стектрейса: в проде Next его не передаёт.
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <PublicPage>
      <ErrorState retry={retry} />
    </PublicPage>
  );
}
