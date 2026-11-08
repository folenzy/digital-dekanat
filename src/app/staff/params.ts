import type { StaffTab } from "@/server/appeals/types";

// Состояние очереди живёт в адресе: ?tab=new|in_progress|waiting|closed&dept=<id>. Без БД — и для клиента.

const TABS: readonly StaffTab[] = ["new", "in_progress", "waiting", "closed"];

type SearchParams = Record<string, string | string[] | undefined>;

export type QueueParams = { tab: StaffTab; dept: number | undefined };

/** Вкладка и отдел из адреса. Неизвестная вкладка → «Новые»; отдел не из своих → все отделы. */
export function parseQueueParams(sp: SearchParams, departmentIds: readonly number[]): QueueParams {
  const tab = typeof sp.tab === "string" && (TABS as readonly string[]).includes(sp.tab) ? (sp.tab as StaffTab) : "new";
  const raw = typeof sp.dept === "string" && /^\d{1,9}$/.test(sp.dept) ? Number(sp.dept) : undefined;
  const dept = raw !== undefined && departmentIds.includes(raw) ? raw : undefined;
  return { tab, dept };
}

/** Ссылка на очередь; значения по умолчанию в адрес не пишутся. */
export function queueHref({ tab, dept }: { tab: StaffTab; dept?: number }): string {
  const q = new URLSearchParams();
  if (tab !== "new") q.set("tab", tab);
  if (dept !== undefined) q.set("dept", String(dept));
  const s = q.toString();
  return s ? `/staff?${s}` : "/staff";
}
