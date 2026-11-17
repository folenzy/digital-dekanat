"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pairName, prettyTime } from "@/server/format";
import type { Lesson } from "@/server/schedule";
import { mskDateKey } from "@/server/time";
import { buildingName, LESSON_TYPE_LABEL } from "./labels";
import { scheduleHref } from "./schedule-params";
import { LESSON_TYPE_CODE } from "./schedule-view";
import { todayHero, type DayProgress } from "./today-hero";
import { nextDayLabel, type NextLesson as Upcoming } from "./today";
import styles from "./NextLesson.module.css";

// Блок «Следующая пара» — первый на «Сегодня». Рамка, не заливка: синяя плашка «важное» остаётся у деканата.
// Первый рендер считается по nowIso сервера (разметка совпадает при гидратации); после монтирования время идёт
// от new Date(): тик на границе минуты, затем раз в минуту, и пересчёт, когда вкладка снова видна.
// Лента и подзаголовок ниже считаются на сервере: когда блок сменил состояние или наступили новые сутки,
// просим сервер обновить страницу (router.refresh) — редко, не на каждый тик.

/** `upcoming` — ближайшая пара (может быть сегодняшней); `nextStudyDay` — первая пара следующего учебного дня. */
type Props = { lessons: Lesson[]; todayKey: string; upcoming?: Upcoming; nextStudyDay?: Upcoming; nowIso: string };

/** Сколько мс до начала следующей минуты (на самой границе — целая минута). */
export function msToNextMinute(now: Date): number {
  return 60_000 - (now.getTime() % 60_000);
}

const mins = (n: number) => `${n} мин`;

/** 270 → «4 ч 30 мин», 45 → «45 мин», 120 → «2 ч». */
function duration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return mins(m);
  return m ? `${h} ч ${mins(m)}` : `${h} ч`;
}

function Bar({ progress }: { progress: DayProgress }) {
  const share = progress.total ? ((progress.passed + progress.currentShare) / progress.total) * 100 : 0;
  return (
    <div className={styles.progress}>
      <div className={styles.bar} aria-hidden="true" data-bar>
        <span className={styles.fill} style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
      </div>
      <p className={styles.caption}>
        прошла {progress.passed} из {progress.total} · до конца пар {duration(progress.leftMinutes)}
      </p>
    </div>
  );
}

function Where({ l }: { l: Lesson }) {
  const room = l.room === "уточняется" ? "аудитория уточняется" : l.room;
  return <>{room}{l.building ? `, ${buildingName(l.building)}` : ""}</>;
}

function Details({ l }: { l: Lesson }) {
  return (
    <>
      <p className={styles.title}>{l.discipline}</p>
      <p className={styles.meta}>
        <span className={styles.type} data-type={l.type}>
          <span aria-hidden="true">{LESSON_TYPE_CODE[l.type]}</span>
          <span className="sr-only">{LESSON_TYPE_LABEL[l.type]}</span>
        </span>
        <span>{pairName(l.pair)}</span>
        <span className="num">{l.start}–{l.end}</span>
        <span><Where l={l} /></span>
      </p>
    </>
  );
}

export function NextLesson({ lessons, todayKey, upcoming, nextStudyDay, nowIso }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(nowIso));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = new Date();
      setNow(t);
      timer = setTimeout(tick, msToNextMinute(t));
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      tick();
    };
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const hero = todayHero(lessons, todayKey, upcoming, now, nextStudyDay);

  // Ключ состояния: вид блока и его пара. Сравниваем с предыдущим клиентским ключом (а не с серверным),
  // поэтому после refresh то же состояние второй раз не обновляет страницу — цикла нет.
  const stateKey = !hero ? "none" : "lesson" in hero ? `${hero.kind}:${hero.lesson.dateKey}:${hero.lesson.pair}` : hero.kind;
  const seenKey = useRef(stateKey);
  const refreshedDay = useRef<string | null>(null);
  useEffect(() => {
    // вкладка дожила до новых суток: «сегодня» с сервера устарело (один запрос на каждые новые сутки)
    if (mskDateKey(now) !== todayKey && refreshedDay.current !== todayKey) {
      refreshedDay.current = todayKey;
      router.refresh();
      return;
    }
    if (seenKey.current !== stateKey) {
      seenKey.current = stateKey;
      router.refresh();
    }
  }, [now, stateKey, todayKey, router]);

  if (!hero) return null;

  if (hero.kind === "done" || hero.kind === "free") {
    const n = hero.next;
    const href = scheduleHref("day", n ? n.dateKey : todayKey);
    return (
      <section className={styles.block} aria-labelledby="next-lesson-h">
        <h2 id="next-lesson-h" className={styles.kicker}>Следующая пара</h2>
        {!n ? (
          <p className={styles.sentence}>На сегодня всё.</p>
        ) : (
          <Link href={href} className={styles.sentence}>
            {hero.kind === "done"
              ? `На сегодня всё. ${nextDayLabel(n.dateKey, now)} первая — ${prettyTime(n.start)}, ${n.discipline}`
              : `Следующая пара — ${nextDayLabel(n.dateKey, now).toLowerCase()}, ${prettyTime(n.start)}, ${n.discipline}`}
          </Link>
        )}
      </section>
    );
  }

  const during = hero.kind === "during";
  return (
    <section className={styles.block} aria-labelledby="next-lesson-h">
      <h2 id="next-lesson-h" className={styles.kicker}>{during ? "Идёт сейчас" : "Следующая пара"}</h2>
      <Link href={scheduleHref("day", hero.lesson.dateKey)} className={styles.link}>
        <p className={styles.count}>
          {during ? `осталось ${mins(hero.minutesLeft)}`
            : hero.minutes === null ? `в ${prettyTime(hero.lesson.start)}` : `через ${mins(hero.minutes)}`}
        </p>
        <Details l={hero.lesson} />
        {during && hero.after && (
          <p className={styles.after}>дальше — {hero.after.discipline}, {prettyTime(hero.after.start)}</p>
        )}
      </Link>
      <Bar progress={hero.progress} />
    </section>
  );
}
