import type { Metadata } from "next";
import { Megaphone, Pin } from "lucide-react";
import { listAllAnnouncements, listAudienceOptions } from "@/server/announcements";
import { requireStaff } from "@/server/auth/viewer";
import { ruWhen } from "@/server/format";
import { Badge } from "@/ui/Badge";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { Section } from "@/ui/Section";
import { AnnouncementForm } from "./AnnouncementForm";
import styles from "./announcements.module.css";

export const metadata: Metadata = { title: "Объявления" };

export default async function StaffAnnouncementsPage() {
  const v = await requireStaff();
  const now = new Date();
  const [options, list] = await Promise.all([listAudienceOptions(), listAllAnnouncements(v)]);

  return (
    <>
      <PageHeader
        title="Объявления"
        subtitle="Студенты из выбранной аудитории сразу получат уведомление, важные закрепятся сверху их ленты."
      />

      <AnnouncementForm options={options} />

      <Section title="Опубликованные" id="published-title">
        {list.length === 0 ? (
          <EmptyState
            icon={<Megaphone />}
            titleAs="h3"
            title="Объявлений пока нет"
            text="Опубликованные объявления появятся здесь — с аудиторией и временем публикации."
          />
        ) : (
          <ul className={styles.list}>
            {list.map((a) => (
              <li key={a.id}>
                <article className={styles.item} data-surface="paper" data-important={a.important || undefined}>
                  <div className={styles.itemMeta}>
                    <span className={styles.audience}>Кому: {a.audience === "Всем" ? "всем студентам" : a.audience}</span>
                    {a.important && <Badge tone="warn" icon={<Pin aria-hidden="true" />}>Важное</Badge>}
                  </div>
                  <h3 className={styles.itemTitle}>{a.title}</h3>
                  <p className={styles.itemBody}>{a.body}</p>
                  <p className={styles.itemFoot}>
                    <time dateTime={a.publishedAt.toISOString()}>{ruWhen(a.publishedAt, now)}</time>, {a.author}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
