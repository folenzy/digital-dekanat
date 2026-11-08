import type { Metadata } from "next";
import { FileQuestion } from "lucide-react";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Обращение не найдено" };

// Чужое, несуществующее или кривое id — одна и та же страница: по ней нельзя понять, есть ли такое обращение.
export default function AppealNotFound() {
  return (
    <EmptyState
      icon={<FileQuestion />}
      titleAs="h1"
      title="Обращение не найдено"
      text="Проверь ссылку. Все твои обращения — в разделе «Деканат»."
      action={<Button href="/dekanat">К моим обращениям</Button>}
    />
  );
}
