"use client";

import { ErrorState } from "@/ui/ErrorState";
import { PublicPage } from "@/ui/PublicPage";

export default function AboutError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <PublicPage>
      <ErrorState title="Не получилось открыть страницу" retry={retry} />
    </PublicPage>
  );
}
