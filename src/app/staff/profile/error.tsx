"use client";

import { ErrorState } from "@/ui/ErrorState";

export default function StaffProfileError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить профиль" retry={retry} />;
}
