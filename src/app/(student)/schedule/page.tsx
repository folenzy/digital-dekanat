import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { requireStudent } from "@/server/auth/viewer";
import { plural, ruDateKey, ruDayTitle, ruWeekdayShort } from "@/server/format";
import { getWeek, type Lesson } from "@/server/schedule";
import { mskAt, mskMinutes, shiftDateKey, toMin } from "@/server/time";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { Tabs } from "@/ui/Tabs";
import type { LessonState } from "@/ui/student/LessonCard";
import { LessonList } from "@/ui/student/LessonList";
import { LESSON_TYPE_LABEL } from "@/ui/student/labels";
import { typeDots } from "@/ui/student/schedule-view";
import { mondayOf, parseScheduleParams, scheduleHref, weekLabel } from "@/ui/student/schedule-params";
import styles from "./schedule.module.css";

export const metadata: Metadata = { title: "Пары" };

const PAIRS: readonly [string, string, string] = ["пара", "пары", "пар"];
/** «в понедельник», «во вторник»… — для пустого дня. */
const ON_DAY = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];


/** Состояния пар сегодняшнего дня: идёт, следующая, прошла. Для других дней — без отметок. */
function statesFor(lessons: Lesson[], isToday: boolean, minutes: number): (LessonState | undefined)[] {
  if (!isToday) return lessons.map(() => undefined);
  const live = lessons.filter((l) => !l.cancelled);
  const current = live.find((l) => toMin(l.start) <= minutes && minutes <= toMin(l.end));
  const next = current ? undefined : live.find((l) => toMin(l.start) > minutes);
  return lessons.map((l) => {
    if (l === current) return "current";
    if (l === next) return "next";
    if (toMin(l.end) < minutes) return "past";
    return undefined;
  });
}

const TYPES = ["lecture", "practice", "lab"] as const;

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const v = await requireStudent();
  const now = new Date();
  const sp = await searchParams;
  const { view, dateKey, today } = parseScheduleParams({ view: sp.view, date: sp.date }, now);
  const week = await getWeek(v, mskAt(dateKey, "12:00"));
  const minutes = mskMinutes(now);

  const monday = mondayOf(dateKey);
  // «сегодня» для расписания: в воскресенье это понедельник (учебная неделя пн–сб)
  const home = parseScheduleParams({}, now).dateKey;
  const atToday = view === "week" ? mondayOf(home) === monday : dateKey === home;
  const day = week.days.find((d) => d.dateKey === dateKey);
  const sundayNote = !sp.date && dateKey !== today;

  return (
    <>
      <PageHeader title="Пары" />

      <Tabs
        label="Вид расписания"
        items={[
          { href: scheduleHref("day", dateKey), label: "День", current: view === "day" },
          { href: scheduleHref("week", dateKey), label: "Неделя", current: view === "week" },
        ]}
      />

      <div className={styles.weekNav}>
        <Link
          href={scheduleHref(view, shiftDateKey(dateKey, -7))}
          className={styles.arrow}
          aria-label="Предыдущая неделя"
          scroll={false}
        >
          <ChevronLeft aria-hidden="true" />
        </Link>
        <div className={styles.weekLabel}>
          <span className={styles.weekRange}>{weekLabel(monday)}</span>
          <span className={styles.parity}>{week.parity === "odd" ? "нечётная неделя" : "чётная неделя"}</span>
        </div>
        <Link
          href={scheduleHref(view, shiftDateKey(dateKey, 7))}
          className={styles.arrow}
          aria-label="Следующая неделя"
          scroll={false}
        >
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>

      {view === "day" && (
        <nav aria-label="Дни недели" className={styles.strip}>
          <ul className={styles.stripList}>
            {week.days.map((d) => {
              const count = d.lessons.filter((l) => !l.cancelled).length;
              const dots = typeDots(d.lessons);
              const changed = d.lessons.some((l) => l.change || l.cancelled);
              return (
                <li key={d.dateKey}>
                  <Link
                    href={scheduleHref("day", d.dateKey)}
                    className={styles.dayLink}
                    aria-current={d.dateKey === dateKey ? "page" : undefined}
                    data-today={d.dateKey === today || undefined}
                    scroll={false}
                  >
                    <span className={styles.dayShort}>{ruWeekdayShort(d.dateKey)}</span>
                    <span className={`${styles.dayNum} num`}>{Number(d.dateKey.slice(8, 10))}</span>
                    <span className={styles.dots} aria-hidden="true">
                      {dots.map((type, i) => <span key={i} className={styles.dot} data-type={type} />)}
                    </span>
                    {changed && <span className={styles.changedMark} aria-hidden="true" />}
                    <span className="sr-only">
                      , {ruDateKey(d.dateKey)}
                      {d.dateKey === today ? ", сегодня" : ""}
                      {count ? `, ${count} ${plural(count, PAIRS)}` : ", пар нет"}
                      {changed ? ", есть изменения" : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {view === "day" && (
        <ul className={styles.legend} aria-label="Обозначения типов занятий">
          {TYPES.map((t) => (
            <li key={t}>
              <span className={styles.dot} data-type={t} aria-hidden="true" />
              {LESSON_TYPE_LABEL[t]}
            </li>
          ))}
          <li>
            <span className={styles.changedMark} data-inline aria-hidden="true" />
            есть изменения
          </li>
        </ul>
      )}

      {!atToday && (
        <p className={styles.back}>
          <Link href={scheduleHref(view, home)} scroll={false}>
            <CalendarDays aria-hidden="true" />
            {view === "week" ? "К текущей неделе" : "К сегодняшнему дню"}
          </Link>
        </p>
      )}

      {view === "day" && day && (
        <section className={styles.day}>
          <h2 className={styles.dayTitle}>
            {ruDayTitle(day.dateKey)}
            {day.dateKey === today && <Badge tone="accent">сегодня</Badge>}
          </h2>
          {sundayNote && <p className={styles.note}>Сегодня воскресенье, поэтому показываем понедельник.</p>}
          {day.lessons.length ? (
            <LessonList lessons={day.lessons} states={statesFor(day.lessons, day.dateKey === today, minutes)} titleAs="h3" />
          ) : (
            <EmptyState
              titleAs="h3"
              title={`${ON_DAY[new Date(`${day.dateKey}T00:00:00Z`).getUTCDay()]} пар нет`.replace(/^./, (c) => c.toUpperCase())}
              text="Загляни в неделю целиком или выбери другой день."
              action={<Button href={scheduleHref("week", day.dateKey)} variant="secondary">Показать неделю</Button>}
            />
          )}
        </section>
      )}

      {view === "week" && (
        <div className={styles.week}>
          {week.days.map((d) => (
            <section key={d.dateKey} className={styles.weekDay} data-today={d.dateKey === today || undefined}>
              <h2 className={styles.dayTitle}>
                {ruDayTitle(d.dateKey)}
                {d.dateKey === today && <Badge tone="accent">сегодня</Badge>}
              </h2>
              {d.lessons.length ? (
                <LessonList lessons={d.lessons} states={statesFor(d.lessons, d.dateKey === today, minutes)} compact titleAs="h3" />
              ) : (
                <p className={styles.free}>Пар нет</p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
