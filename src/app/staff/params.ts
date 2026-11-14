import { QUEUE_GROUP_KEYS, type QueueGroupKey, type StaffTab } from "@/server/appeals/types";

// Состояние очереди живёт в адресе: ?tab=new|in_progress|waiting|closed&dept=<id>&show=<группа>.
// show — какую группу показать целиком (остальные — первые строки). Без БД — и для клиента.

const TABS: readonly StaffTab[] = ["new", "in_progress", "waiting", "closed"];

type SearchParams = Record<string, string | string[] | undefined>;

export type QueueParams = { tab: StaffTab; dept: number | undefined; show: QueueGroupKey | undefined };

/** Вкладка, отдел и развёрнутая группа из адреса. Неизвестная вкладка → «Новые»; отдел не из своих → все отделы. */
export function parseQueueParams(sp: SearchParams, departmentIds: readonly number[]): QueueParams {
  const tab = typeof sp.tab === "string" && (TABS as readonly string[]).includes(sp.tab) ? (sp.tab as StaffTab) : "new";
  const raw = typeof sp.dept === "string" && /^\d{1,9}$/.test(sp.dept) ? Number(sp.dept) : undefined;
  const dept = raw !== undefined && departmentIds.includes(raw) ? raw : undefined;
  const show = typeof sp.show === "string" && (QUEUE_GROUP_KEYS as readonly string[]).includes(sp.show)
    ? (sp.show as QueueGroupKey)
    : undefined;
  return { tab, dept, show };
}

/** Ссылка на очередь; значения по умолчанию в адрес не пишутся. */
export function queueHref({ tab, dept, show }: { tab: StaffTab; dept?: number; show?: QueueGroupKey }): string {
  const q = new URLSearchParams();
  if (tab !== "new") q.set("tab", tab);
  if (dept !== undefined) q.set("dept", String(dept));
  if (show !== undefined) q.set("show", show);
  const s = q.toString();
  return s ? `/staff?${s}` : "/staff";
}
