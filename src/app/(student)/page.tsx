import type { Metadata } from "next";
import Link from "next/link";
import { Sunrise } from "lucide-react";
import { listMyAppeals } from "@/server/appeals/service";
import { requireStudent } from "@/server/auth/viewer";
import { listAnnouncementsFor } from "@/server/announcements";
import { listUpcomingDeadlines } from "@/server/deadlines";
import { dayDiff, greeting, mskTime, plural, ruDate, ruDateKey, ruDayTitle, ruWeekday, ruWhen } from "@/server/format";
import { getNudges, type Nudge, type NudgeKind } from "@/server/nudges";
import { getProfile } from "@/server/profile";
import { getDay, getTodayOverview, type Lesson } from "@/server/schedule";
import { mskAt, mskDateKey, mskMinutes, toMin } from "@/server/time";
import { Badge } from "@/ui/Badge";
import { AppealListCard } from "@/ui/appeals/AppealListCard";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { PageHeader } from "@/ui/PageHeader";
import { Section } from "@/ui/Section";
import { LessonCard, type LessonState } from "@/ui/student/LessonCard";
import { nextDayLabel, todaySummary } from "@/ui/student/today";
import styles from "./today.module.css";

export const metadata: Metadata = { title: "Сегодня" };

const NUDGE_KICKER: Record<NudgeKind, string> = {
  needs_info: "Нужен твой ответ",
  cert_ready: "Справка готова",
  debt: "Долг",
  admission_risk: "Допуск к сессии",
  stipend_increased: "Стипендия",
  schedule_change: "Расписание",
};

const DAYS: readonly [string, string, string] = ["день", "дня", "дней"];

function NudgeCard({ nudge, first }: { nudge: Nudge; first: boolean }) {
  return (
    <Card
      as="li"
      variant={first ? "ink" : "accent"}
      kicker={first ? "Деканат пишет первым" : NUDGE_KICKER[nudge.kind]}
      title={nudge.title}
    >
      <p className={styles.nudgeText}>{nudge.body}</p>
      <div className={styles.nudgeAction}>
        <Button href={nudge.action.href} variant={first ? "primary" : "secondary"}>
          {nudge.action.label}
        </Button>
      </div>
    </Card>
  );
}

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
  const [profile, nudges, overview, appeals, deadlines, announcements] = await Promise.all([
    getProfile(v),
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

  return (
    <div className={styles.page}>
      <PageHeader
        kicker={ruDayTitle(today)}
        title={`${greeting(now)}, ${profile.firstName}`}
        subtitle={todaySummary({ lessons, current, next, appeals }, now)}
      />

      {nudges.length > 0 && (
        <section aria-label="Деканат пишет первым">
          <ul className={styles.stack}>
            {nudges.map((n, i) => <NudgeCard key={n.id} nudge={n} first={i === 0} />)}
          </ul>
        </section>
      )}

      <Section title="Пары сегодня" action={<Link href="/schedule">Все пары</Link>}>
        {active.length === 0 && <p className={styles.quiet}>Сегодня пар нет.</p>}
        {lessons.length > 0 && (
          <ol className={styles.stack}>
            {lessons.map((l) => (
              <li key={`${l.pair}-${l.discipline}`}>
                <LessonCard lesson={l} state={lessonState(l, current, nextToday, minutes)} />
              </li>
            ))}
          </ol>
        )}
        {finishedToday && <p className={styles.done}>На сегодня всё — пары закончились.</p>}
      </Section>

      {/* Следующий учебный день — отдельный блок на другой подложке и с плашкой дня */}
      {nextDayKey && (
        <section className={styles.nextDay} aria-labelledby="next-day">
          <div className={styles.nextDayHead}>
            <h2 className={styles.nextDayTitle} id="next-day">
              <span className={styles.dayChip}>
                <Sunrise aria-hidden="true" className={styles.dayChipIcon} />
                {nextDayLabel(nextDayKey, now)}
              </span>
              <span className={styles.nextDayDate}>{ruWeekday(nextDayKey)}, {ruDateKey(nextDayKey)}</span>
            </h2>
            <Link href={`/schedule?date=${nextDayKey}`} className={styles.nextDayLink}>Весь день</Link>
          </div>
          <ol className={styles.stack}>
            {nextDayLessons.map((l) => (
              <li key={`${l.pair}-${l.discipline}`}><LessonCard lesson={l} compact /></li>
            ))}
          </ol>
        </section>
      )}

      <Section title="Мои обращения" action={appeals.length > 0 ? <Link href="/dekanat">Все обращения</Link> : undefined}>
        {appeals.length === 0 ? (
          <p className={styles.quiet}>
            Активных обращений нет. <Link href="/dekanat">Написать в деканат →</Link>
          </p>
        ) : (
          <ul className={styles.stack}>
            {myAppeals.map((a) => (
              <li key={a.id}><AppealListCard appeal={a} now={now} /></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Скоро дедлайны">
        {deadlines.length === 0 ? (
          <p className={styles.quiet}>На две недели вперёд сроков нет.</p>
        ) : (
          <ul className={styles.deadlines} data-surface="paper">
            {deadlines.map((d) => {
              const left = dayDiff(today, mskDateKey(d.due));
              const when = left === 0 ? "сегодня" : left === 1 ? "завтра" : `через ${left} ${plural(left, DAYS)}`;
              const content = (
                <>
                  <span className={styles.deadlineTitle}>{d.title}</span>
                  <span className={styles.deadlineDue}>
                    до {ruDate(d.due)}, {mskTime(d.due)}
                    <Badge tone={left <= 3 ? "warn" : "neutral"}>{when}</Badge>
                  </span>
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
          <Card as="article" kicker={ruWhen(latest.publishedAt, now)} title={latest.title}>
            {latest.important && <p className={styles.important}><Badge tone="accent">Важное</Badge></p>}
            <p className={styles.announcement}>{latest.body}</p>
            <p className={styles.dept}>Кому: {latest.audience.toLowerCase() === "всем" ? "всем студентам" : latest.audience}</p>
          </Card>
        ) : (
          <p className={styles.quiet}>Объявлений пока нет.</p>
        )}
      </Section>
    </div>
  );
}
