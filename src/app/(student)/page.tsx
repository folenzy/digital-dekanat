import type { Metadata } from "next";
import Link from "next/link";
import { listMyAppeals } from "@/server/appeals/service";
import { requireStudent } from "@/server/auth/viewer";
import { listAnnouncementsFor } from "@/server/announcements";
import { listUpcomingDeadlines } from "@/server/deadlines";
import { dayDiff, mskTime, plural, ruDate, ruDateKey, ruDayTitle, ruWhen } from "@/server/format";
import { getNudges } from "@/server/nudges";
import { getDay, getTodayOverview, type Lesson } from "@/server/schedule";
import { mskAt, mskDateKey, mskMinutes, toMin } from "@/server/time";
import { Badge } from "@/ui/Badge";
import { AppealList } from "@/ui/appeals/AppealListCard";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { PageHeader } from "@/ui/PageHeader";
import { Section } from "@/ui/Section";
import { Agenda } from "@/ui/student/Agenda";
import { NextLesson } from "@/ui/student/NextLesson";
import type { LessonState } from "@/ui/student/LessonCard";
import { nextDayLabel, todaySummary } from "@/ui/student/today";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Сегодня" };

const DAYS: readonly [string, string, string] = ["день", "дня", "дней"];

function lessonState(l: Lesson, current: Lesson | undefined, next: Lesson | undefined, minutes: number): LessonState | undefined {
  if (current && l.pair === current.pair && !l.cancelled) return "current";
  if (next && l.pair === next.pair && !l.cancelled) return "next";
  if (toMin(l.end) < minutes) return "past";
  return undefined;
}

export default async function TodayPage() {
  const v = await requireStudent();
  const now = new Date();
  const today = mskDateKey(now);
  const [nudges, overview, appeals, deadlines, announcements] = await Promise.all([
    getNudges(v, now),
    getTodayOverview(v, now),
    listMyAppeals(v, "active", now),
    listUpcomingDeadlines(v, now),
    listAnnouncementsFor(v),
  ]);

  const { lessons, current, next } = overview;
  const active = lessons.filter((l) => !l.cancelled);
  const nextToday = next && next.dateKey === today ? next : undefined;
  const minutes = mskMinutes(now);
  // Сегодняшние пары закончились (или их не было) — следующий учебный день показываем отдельным блоком,
  // чтобы завтрашнее расписание нельзя было принять за сегодняшнее.
  const nextDayKey = !current && !nextToday && next ? next.dateKey : null;
  const nextDayLessons = nextDayKey ? await getDay(v, mskAt(nextDayKey, "12:00")) : [];
  const finishedToday = active.length > 0 && nextDayKey !== null;
  // сначала то, что ждёт тебя: уточнение, затем готовое, затем то, что в работе
  const urgency = { needs_info: 0, ready: 1, in_progress: 2, submitted: 3, rejected: 4, closed: 5 } as const;
  const myAppeals = [...appeals].sort((a, b) => urgency[a.status] - urgency[b.status]);
  const latest = [...announcements].sort((a, b) => +b.publishedAt - +a.publishedAt)[0];

  const [lead, ...rest] = nudges;

  return (
    <>
      {/* Заголовок — сам день: приветствий нет, первая же строка отвечает «что сейчас» */}
      <PageHeader title={ruDayTitle(today)} subtitle={todaySummary({ lessons, current, next, appeals }, now)} />

      <NextLesson lessons={lessons} todayKey={today} upcoming={next} nowIso={now.toISOString()} />

      {nudges.length > 0 && (
        <section aria-label="Деканат пишет первым">
          {/* Одна плашка «важное» с главным действием; остальное — строками */}
          <Card as="div" variant="ink" title={lead.title} titleAs="h2" className={styles.lead}>
            <p className={styles.nudgeText}>{lead.body}</p>
            <div className={styles.nudgeAction}>
              <Button href={lead.action.href} variant="primary">{lead.action.label}</Button>
            </div>
          </Card>
          {rest.length > 0 && (
            <ul className={styles.attention}>
              {rest.map((n) => (
                <li key={n.id}>
                  <h2 className={styles.attentionTitle}>{n.title}</h2>
                  <p className={styles.attentionText}>{n.body}</p>
                  <Link href={n.action.href} className={styles.attentionLink}>{n.action.label}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Section title="Пары сегодня" action={<Link href="/schedule">Все пары</Link>}>
        {active.length === 0 && <p className={styles.quiet}>Сегодня пар нет.</p>}
        {lessons.length > 0 && (
          <Agenda lessons={lessons} states={lessons.map((l) => lessonState(l, current, nextToday, minutes))} />
        )}
        {finishedToday && <p className={styles.done}>На сегодня всё, пары закончились.</p>}
      </Section>

      {/* Следующий учебный день — отдельный раздел с датой в заголовке, чтобы его не приняли за сегодняшний */}
      {nextDayKey && (
        <Section
          title={`${nextDayLabel(nextDayKey, now)}, ${ruDateKey(nextDayKey)}`}
          action={<Link href={`/schedule?date=${nextDayKey}`}>Весь день</Link>}
        >
          <Agenda lessons={nextDayLessons} />
        </Section>
      )}

      <Section title="Мои обращения" action={appeals.length > 0 ? <Link href="/dekanat">Все обращения</Link> : undefined}>
        {appeals.length === 0 ? (
          <p className={styles.quiet}>
            Активных обращений нет. <Link href="/dekanat">Написать в деканат</Link>
          </p>
        ) : (
          <AppealList appeals={myAppeals} now={now} />
        )}
      </Section>

      <Section title="Скоро дедлайны">
        {deadlines.length === 0 ? (
          <p className={styles.quiet}>На две недели вперёд сроков нет.</p>
        ) : (
          <ul className={styles.deadlines}>
            {deadlines.map((d) => {
              const left = dayDiff(today, mskDateKey(d.due));
              const when = left === 0 ? "сегодня" : left === 1 ? "завтра" : `через ${left} ${plural(left, DAYS)}`;
              const content = (
                <>
                  <span className={styles.deadlineTitle}>{d.title}</span>
                  <span className={styles.deadlineWhen} data-soon={left <= 3 || undefined}>{when}</span>
                  <span className={styles.deadlineDue}>до {ruDate(d.due)}, {mskTime(d.due)}</span>
                </>
              );
              return (
                <li key={`${d.kind}-${d.title}`}>
                  {d.href ? <Link href={d.href} className={styles.deadline}>{content}</Link>
                    : <div className={styles.deadline}>{content}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Объявление деканата"
        action={latest ? <Link href="/notifications?tab=announcements">Все объявления</Link> : undefined}
      >
        {latest ? (
          <Card as="article" variant="plain" title={latest.title}>
            <p className={styles.announcementMeta}>
              <span>{ruWhen(latest.publishedAt, now)}</span>
              <span>{latest.audience.toLowerCase() === "всем" ? "всем студентам" : latest.audience}</span>
              {latest.important && <Badge tone="warn">Важное</Badge>}
            </p>
            <p className={styles.announcement}>{latest.body}</p>
          </Card>
        ) : (
          <p className={styles.quiet}>Объявлений пока нет.</p>
        )}
      </Section>
    </>
  );
}
