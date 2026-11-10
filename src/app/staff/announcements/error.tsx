"use client";

import { ErrorState } from "@/ui/ErrorState";

export default function StaffAnnouncementsError({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState title="Не получилось загрузить объявления" retry={retry} />;
}
