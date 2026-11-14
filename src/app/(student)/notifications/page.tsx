import type { Metadata } from "next";
import { CheckCheck, Megaphone } from "lucide-react";
import { requireStudent } from "@/server/auth/viewer";
import { listAnnouncementsFor } from "@/server/announcements";
import { ruWhen } from "@/server/format";
import { listNotifications } from "@/server/notifications";
import { Badge } from "@/ui/Badge";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { SubmitButton } from "@/ui/SubmitButton";
import { Tabs } from "@/ui/Tabs";
import { markAllReadAction, openNotificationAction } from "./actions";
import { ItemButton } from "./ItemButton";
import { NotificationsEmpty } from "./NotificationsEmpty";
import styles from "./notifications.module.css";

export const metadata: Metadata = { title: "Уведомления" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const v = await requireStudent();
  const now = new Date();
  const sp = await searchParams;
  const tab = sp.tab === "announcements" ? "announcements" : "notifications";
  const filter = sp.filter === "unread" ? "unread" : "all";
  const [all, announcements] = await Promise.all([listNotifications(v), listAnnouncementsFor(v)]);
  const unread = all.filter((n) => !n.read);
  const shown = filter === "unread" ? unread : all;

  return (
    <>
      <PageHeader title="Уведомления" />

      <Tabs
        label="Уведомления и объявления"
        items={[
          { href: "/notifications", label: "Уведомления", current: tab === "notifications", count: unread.length },
          { href: "/notifications?tab=announcements", label: "Объявления", current: tab === "announcements" },
        ]}
      />

      {tab === "notifications" && (
        <>
          <div className={styles.toolbar}>
            <Tabs
              label="Какие показать"
              size="small"
              items={[
                { href: "/notifications", label: "Все", current: filter === "all" },
                { href: "/notifications?filter=unread", label: "Непрочитанные", current: filter === "unread" },
              ]}
            />
            {unread.length > 0 && (
              <form action={markAllReadAction}>
                <SubmitButton variant="ghost" icon={<CheckCheck />}>Прочитать всё</SubmitButton>
              </form>
            )}
          </div>

          {shown.length === 0 ? (
            <NotificationsEmpty total={all.length} filter={filter} />
          ) : (
            <ul className={styles.list}>
              {shown.map((n) => {
                return (
                  <li key={n.id}>
                    <form action={openNotificationAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <ItemButton className={styles.item}>
                        <span className={styles.text}>
                          <span className={styles.title}>
                            {!n.read && <span className="sr-only">Новое: </span>}
                            {n.title}
                          </span>
                          <span className={styles.body}>{n.body}</span>
                          <span className={styles.when}>{ruWhen(n.createdAt, now)}</span>
                        </span>
                        {!n.read && <span className={styles.dot} aria-hidden="true" />}
                      </ItemButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === "announcements" && (
        announcements.length === 0 ? (
          <EmptyState icon={<Megaphone />} title="Объявлений пока нет" text="Здесь появятся объявления деканата для твоего курса и группы." />
        ) : (
          <ul className={styles.list}>
            {announcements.map((a) => (
              <li key={a.id} className={styles.annItem}>
                <h2 className={styles.annTitle}>{a.title}</h2>
                <p className={styles.annMeta}>
                  <span>{ruWhen(a.publishedAt, now)}</span>
                  <span>{a.audience === "Всем" ? "всем студентам" : a.audience}</span>
                  {a.important && <Badge tone="warn">Важное</Badge>}
                </p>
                <p className={styles.announcement}>{a.body}</p>
              </li>
            ))}
          </ul>
        )
      )}
    </>
  );
}
