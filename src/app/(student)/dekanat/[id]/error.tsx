"use client";

import { ErrorState } from "@/ui/ErrorState";

export default function AppealError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить обращение" retry={retry} />;
}
