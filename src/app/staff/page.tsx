import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Clock3, Inbox, MessageCircleQuestionMark, type LucideIcon } from "lucide-react";
import {
  countQueueTabs, getStaffSummary, listQueueGroups, listStaffDepartments, QUEUE_GROUP_LIMIT,
} from "@/server/appeals/staff";
import type { StaffTab } from "@/server/appeals/types";
import { requireStaff } from "@/server/auth/viewer";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { QueueHead, QueueRow } from "@/ui/staff/QueueRow";
import { avgResponseText, DEPT_SHORT, QUEUE_GROUP_LABEL, QUEUE_TABS } from "@/ui/staff/labels";
import { Tabs } from "@/ui/Tabs";
import { parseQueueParams, queueHref } from "./params";
import { TakeNextForm } from "./TakeNextForm";
import styles from "./queue.module.css";

export const metadata: Metadata = { title: "Очередь обращений" };

const TAB_ICON: Record<StaffTab, LucideIcon> = {
  new: Inbox, in_progress: Clock3, waiting: MessageCircleQuestionMark, closed: Archive,
};

export default async function QueuePage({ searchParams }: PageProps<"/staff">) {
  const v = await requireStaff();
  const now = new Date();
  const [sp, departments] = await Promise.all([searchParams, listStaffDepartments(v)]);
  const { tab, dept, show } = parseQueueParams(sp, departments.map((d) => d.id));

  // Счётчики вкладок — одним запросом; строк загружается только видимая вкладка, по группам и с пределом
  const [summary, counts, groups] = await Promise.all([
    getStaffSummary(v, now),
    countQueueTabs(v, dept),
    listQueueGroups(v, tab, dept, now, show),
  ]);
  const meta = QUEUE_TABS.find((t) => t.tab === tab)!;
  const TabIcon = TAB_ICON[tab];
  const deptName = departments.find((d) => d.id === dept)?.name;

  return (
    <>
      <PageHeader title="Очередь" />

      <div className={styles.top}>
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
      {/* Главное действие экрана: не выискивать глазами, а брать самое срочное */}
      {counts.new > 0 && <TakeNextForm dept={dept} />}
      </div>

      <div className={styles.controls}>
      <div className={styles.tabs}>
        <Tabs
          label="Вкладки очереди"
          items={QUEUE_TABS.map((t) => ({
            href: queueHref({ tab: t.tab, dept }),
            label: t.label,
            current: t.tab === tab,
            count: counts[t.tab],
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

      {groups.length === 0 ? (
        <EmptyState
          icon={<TabIcon />}
          title={meta.emptyTitle}
          text={deptName ? <>{meta.emptyText} Сейчас показан только отдел «{deptName}».</> : meta.emptyText}
        />
      ) : (
        <div className={styles.table}>
          <QueueHead closed={tab === "closed"} />
          {groups.map((g) => {
            const titleId = `group-${g.key}`;
            const hidden = g.total - g.items.length;
            return (
              <section key={g.key} className={styles.group} aria-labelledby={titleId} data-group={g.key}>
                {/* Заголовок группы — родитель для заголовков строк (h3). У единственной группы он только для скринридера */}
                <h2 id={titleId} className={g.key === "all" ? "sr-only" : styles.groupTitle}>
                  {g.key === "all" ? `Обращения: ${meta.label.toLowerCase()}` : (
                    <>
                      {QUEUE_GROUP_LABEL[g.key]}{" "}
                      <span className={styles.groupCount}>{g.total}</span>
                    </>
                  )}
                </h2>
                <ul className={styles.list} aria-labelledby={titleId}>
                  {g.items.map((a) => (
                    <li key={a.id}>
                      <QueueRow appeal={a} now={now} />
                    </li>
                  ))}
                </ul>
                {hidden > 0 && (
                  <p className={styles.more}>
                    <Link href={queueHref({ tab, dept, show: g.key })} scroll={false}>
                      Показать все {g.total}
                    </Link>
                  </p>
                )}
                {show === g.key && g.items.length > QUEUE_GROUP_LIMIT && (
                  <p className={styles.more}>
                    <Link href={queueHref({ tab, dept })} scroll={false}>Свернуть</Link>
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
