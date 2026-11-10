import { Archive, CircleCheck, CircleX, Clock3, MessageCircleQuestionMark, Send, type LucideIcon } from "lucide-react";
import type { AppealStatus } from "@/server/appeals/types";
import { Badge, type BadgeTone } from "./Badge";

// Статус обращения так, как его видит человек (спека §7.5).

export const STATUS_META: Record<AppealStatus, { label: string; tone: BadgeTone; Icon: LucideIcon }> = {
  submitted: { label: "Отправлено", tone: "info", Icon: Send },
  in_progress: { label: "В работе", tone: "accent", Icon: Clock3 },
  needs_info: { label: "Нужно уточнение", tone: "warn", Icon: MessageCircleQuestionMark },
  ready: { label: "Готово", tone: "ok", Icon: CircleCheck },
  rejected: { label: "Отклонено", tone: "danger", Icon: CircleX },
  closed: { label: "Закрыто", tone: "neutral", Icon: Archive },
};

export function StatusBadge({ status }: { status: AppealStatus }) {
  const { label, tone, Icon } = STATUS_META[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden="true" />}>
      {label}
    </Badge>
  );
}
