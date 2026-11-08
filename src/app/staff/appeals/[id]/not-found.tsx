import type { Metadata } from "next";
import { FileQuestion } from "lucide-react";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Обращение не найдено" };

// Кривое id, несуществующее или из чужого отдела — одна и та же страница.
export default function StaffAppealNotFound() {
  return (
    <EmptyState
      icon={<FileQuestion />}
      titleAs="h1"
      title="Обращение не найдено"
      text="Проверь ссылку. Все обращения твоих отделов — в очереди."
      action={<Button href="/staff">К очереди</Button>}
    />
  );
}
