"use client";

import { ErrorState } from "@/ui/ErrorState";

export default function NewAppealError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось открыть новое обращение" retry={retry} />;
}
