import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Clock3, Inbox, MessageCircleQuestionMark, type LucideIcon } from "lucide-react";
import { getStaffSummary, listQueue, listStaffDepartments } from "@/server/appeals/staff";
import type { QueueItem, StaffTab } from "@/server/appeals/types";
import { requireStaff } from "@/server/auth/viewer";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { QueueHead, QueueRow } from "@/ui/staff/QueueRow";
import { avgResponseText, DEPT_SHORT, QUEUE_TABS } from "@/ui/staff/labels";
import { Tabs } from "@/ui/Tabs";
import { parseQueueParams, queueHref } from "./params";
import styles from "./queue.module.css";

export const metadata: Metadata = { title: "Очередь обращений" };

const TAB_ICON: Record<StaffTab, LucideIcon> = {
  new: Inbox, in_progress: Clock3, waiting: MessageCircleQuestionMark, closed: Archive,
};

/** «Закрытые»: свежие сверху (срок ответа там уже не важен); остальные вкладки — по сроку, как отдаёт сервер. */
function ordered(tab: StaffTab, items: QueueItem[]): QueueItem[] {
  if (tab !== "closed") return items;
  return [...items].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export default async function QueuePage({ searchParams }: PageProps<"/staff">) {
  const v = await requireStaff();
  const now = new Date();
  const [sp, departments] = await Promise.all([searchParams, listStaffDepartments(v)]);
  const { tab, dept } = parseQueueParams(sp, departments.map((d) => d.id));

  const [summary, ...lists] = await Promise.all([
    getStaffSummary(v, now),
    ...QUEUE_TABS.map((t) => listQueue(v, t.tab, dept, now)),
  ]);
  const byTab = new Map(QUEUE_TABS.map((t, i) => [t.tab, lists[i]]));
  const items = ordered(tab, byTab.get(tab) ?? []);
  const meta = QUEUE_TABS.find((t) => t.tab === tab)!;
  const TabIcon = TAB_ICON[tab];
  const deptName = departments.find((d) => d.id === dept)?.name;

  return (
    <>
      <PageHeader title="Очередь" />

      <section className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className="sr-only">Сводка по моим отделам</h2>
        <dl className={styles.ledger}>
          <div className={styles.cell}>
            <dt>Новых</dt>
            <dd>{summary.new}</dd>
          </div>
          <div className={styles.cell}>
            <dt>В работе</dt>
            <dd>{summary.inProgress}</dd>
          </div>
          <div className={styles.cell} data-alert={summary.overdue > 0 || undefined}>
            <dt>Просрочено</dt>
            <dd>{summary.overdue}</dd>
          </div>
          <div className={styles.cell}>
            <dt>Первый ответ в среднем за неделю</dt>
            <dd>{avgResponseText(summary.avgFirstResponseHoursWeek)}</dd>
          </div>
        </dl>
      </section>

      <div className={styles.controls}>
      <div className={styles.tabs}>
        <Tabs
          label="Вкладки очереди"
          items={QUEUE_TABS.map((t) => ({
            href: queueHref({ tab: t.tab, dept }),
            label: t.label,
            current: t.tab === tab,
            count: byTab.get(t.tab)?.length,
          }))}
        />
      </div>

      {departments.length > 1 && (
        <nav aria-label="Отдел" className={styles.depts}>
          <ul>
            <li>
              <Link href={queueHref({ tab })} aria-current={dept === undefined ? "page" : undefined} scroll={false}>
                Все отделы
              </Link>
            </li>
            {departments.map((d) => (
              <li key={d.id}>
                <Link
                  href={queueHref({ tab, dept: d.id })}
                  aria-current={dept === d.id ? "page" : undefined}
                  title={d.name}
                  scroll={false}
                >
                  {DEPT_SHORT[d.code] ?? d.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<TabIcon />}
          title={meta.emptyTitle}
          text={deptName ? <>{meta.emptyText} Сейчас показан только отдел «{deptName}».</> : meta.emptyText}
        />
      ) : (
        <div className={styles.table}>
          {/* строки — заголовки третьего уровня: им нужен родительский заголовок раздела */}
          <h2 className="sr-only">Обращения: {meta.label.toLowerCase()}</h2>
          <QueueHead closed={tab === "closed"} />
          <ul className={styles.list} aria-label="Обращения">
            {items.map((a) => (
              <li key={a.id}>
                <QueueRow appeal={a} now={now} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
