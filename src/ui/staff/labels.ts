import type { AppealStatus, StaffTab } from "@/server/appeals/types";
import { plural } from "@/server/format";
import { mskDateKey, shiftDateKey } from "@/server/time";

// Тексты кабинета сотрудника: вкладки очереди, сводка, публикация, срок выдачи справки. Без БД — и для клиента.

export type QueueTabMeta = { tab: StaffTab; label: string; emptyTitle: string; emptyText: string };

/** Вкладки очереди (спека §7.9) и что показать, когда во вкладке пусто. */
export const QUEUE_TABS: readonly QueueTabMeta[] = [
  {
    tab: "new", label: "Новые",
    emptyTitle: "Новых обращений нет",
    emptyText: "Все обращения разобраны. Новое появится здесь сразу, как студент его отправит.",
  },
  {
    tab: "in_progress", label: "В работе",
    emptyTitle: "В работе ничего нет",
    emptyText: "Возьми обращение из «Новых» — оно перейдёт сюда, а студент увидит, кто им занимается.",
  },
  {
    tab: "waiting", label: "Ждут студента",
    emptyTitle: "Никто не должен ответа",
    emptyText: "Когда запросишь уточнение, обращение будет ждать здесь, пока студент не ответит. Срок на это время не идёт.",
  },
  {
    tab: "closed", label: "Закрытые",
    emptyTitle: "Закрытых обращений пока нет",
    emptyText: "Сюда попадут готовые, отклонённые и закрытые обращения.",
  },
];

const TAB_OF_STATUS: Record<AppealStatus, StaffTab> = {
  submitted: "new",
  in_progress: "in_progress",
  needs_info: "waiting",
  ready: "closed",
  rejected: "closed",
  closed: "closed",
};

/** В какой вкладке очереди лежит обращение с этим статусом. */
export function tabOfStatus(status: AppealStatus): StaffTab {
  return TAB_OF_STATUS[status];
}

/** Среднее время первого ответа (часы, до 0,1) → «42 мин» / «1,5 ч»; нет данных — «—». */
export function avgResponseText(hours: number | null): string {
  if (hours === null) return "—";
  if (hours === 0) return "до 3 мин"; // меньше 0,05 ч после округления
  if (hours < 1) return `${Math.round(hours * 60)} мин`;
  return `${String(hours).replace(".", ",")} ч`;
}

/** Баннер после публикации объявления. */
export function publishedText(recipients: number): string {
  if (recipients === 0) return "Опубликовано. В этой аудитории пока нет студентов";
  const verb = plural(recipients, ["увидит", "увидят", "увидят"]);
  return `Опубликовано: ${verb} ${recipients} ${plural(recipients, ["студент", "студента", "студентов"])}`;
}

/** Место выдачи справок по умолчанию — единое окно (см. «О проекте»). */
export const PICKUP_PLACE_DEFAULT = "каб. 214, корпус А";
/** Справку хранят до 17:00 выбранного дня — конец приёма в едином окне. */
export const PICKUP_HOUR = "17:00";
/** Дальше этого срок выдачи не ставим. */
export const PICKUP_MAX_DAYS = 90;

/** «До» по умолчанию: через 5 дней по Москве, суббота и воскресенье сдвигаются на понедельник. */
export function pickupDefaultKey(now: Date): string {
  const key = shiftDateKey(mskDateKey(now), 5);
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 — вс, 6 — сб
  if (wd === 6) return shiftDateKey(key, 2);
  if (wd === 0) return shiftDateKey(key, 1);
  return key;
}
