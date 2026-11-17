import type { Metadata } from "next";
import { GraduationCap, NotebookPen } from "lucide-react";
import { requireStudent } from "@/server/auth/viewer";
import { formatAverage, mskTime, plural, ruDateKey, ruRelativeDate, ruWeekdayShort } from "@/server/format";
import { currentSemester, getStudySummary, type ExamView, type StudySummary } from "@/server/grades";
import { mskDateKey } from "@/server/time";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { Section } from "@/ui/Section";
import { Tabs } from "@/ui/Tabs";
import { SubjectCard } from "@/ui/student/SubjectCard";
import { buildingName, CONTROL_FORM_LABEL, EXAM_KIND_LABEL, gradeLabel, isDebtGrade, VERDICT_COPY } from "@/ui/student/labels";
import styles from "./study.module.css";

export const metadata: Metadata = { title: "Учёба" };

type Tab = "semester" | "session" | "history";
const DAYS: readonly [string, string, string] = ["день", "дня", "дней"];

function Verdict({ s, now }: { s: StudySummary; now: Date }) {
  const copy = VERDICT_COPY[s.verdict];
  const total = s.admission.admitted + s.admission.denied + s.admission.pending;
  return (
    <Card
      variant={s.verdict === "debts" ? "ink" : "plain"}
      title={copy.title}
      titleAs="h2"
      className={styles.verdict}
    >
      <p className={styles.verdictText}>{copy.text}</p>

      {(s.debts.length > 0 || s.risks.length > 0) && (
        <ul className={styles.issues}>
          {s.debts.map((d) => (
            <li key={`d${d.enrollmentId}`}>
              <strong>{d.discipline}</strong>, {d.semester} семестр: {gradeLabel(d.grade)}.{" "}
              {d.retake
                ? `Пересдача ${ruRelativeDate(d.retake.startsAt, now)} в ${mskTime(d.retake.startsAt)}, ауд. ${d.retake.room}.`
                : "Пересдача пока не назначена."}
            </li>
          ))}
          {s.risks.map((r) => (
            <li key={`r${r.checkpointId}`}>
              <strong>{r.discipline}</strong>: «{r.title}»,{" "}
              {r.overdue ? `срок прошёл ${ruDateKey(r.dueDate)}` : `срок ${ruDateKey(r.dueDate)} (через ${r.daysLeft} ${plural(r.daysLeft, DAYS)})`}.
            </li>
          ))}
        </ul>
      )}

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Средний балл</dt>
          <dd className={`${styles.statValue} num`}>{s.avgLastSession === null ? "—" : formatAverage(s.avgLastSession)}</dd>
          <dd className={styles.statNote}>{s.avgLastSession === null ? "оценок ещё нет" : "за прошлую сессию"}</dd>
        </div>
        <div className={styles.stat} data-alert={s.debts.length > 0 || undefined}>
          <dt>Долги</dt>
          <dd className={`${styles.statValue} num`}>{s.debts.length}</dd>
          <dd className={styles.statNote}>{s.debts.length ? "нужно пересдать" : "всё сдано"}</dd>
        </div>
        <div className={styles.stat} data-alert={s.admission.denied > 0 || undefined}>
          <dt>Допуск к сессии</dt>
          <dd className={`${styles.statValue} num`}>{s.admission.admitted} из {total}</dd>
          <dd className={styles.statNote}>
            {s.admission.denied ? `нет допуска: ${s.admission.denied}` : s.admission.pending ? `ждём решения: ${s.admission.pending}` : "по всем дисциплинам"}
          </dd>
        </div>
      </dl>

      {s.debts.length > 0 && (
        <div className={styles.verdictAction}>
          <Button href="/study?tab=session" variant="primary">Расписание пересдач</Button>
        </div>
      )}
    </Card>
  );
}

function ExamRow({ e }: { e: ExamView }) {
  const key = mskDateKey(e.startsAt);
  const [dayNum, month] = ruDateKey(key).split(" ");
  return (
    <li className={styles.exam} data-surface="paper" data-retake={e.kind === "retake" || undefined}>
      <span className={styles.examDate} aria-hidden="true">
        <span className={`${styles.examDay} num`}>{dayNum}</span>
        <span className={styles.examMonth}>{month.slice(0, 3)}, {ruWeekdayShort(key).toLowerCase()}</span>
      </span>
      <span className={styles.examBody}>
        <span className={styles.examTitle}>{e.discipline}</span>
        <span className={styles.examMeta}>
          <span className="sr-only">{ruDateKey(key)}, </span>
          {EXAM_KIND_LABEL[e.kind]} в {mskTime(e.startsAt)}, ауд. {e.room}
          {e.building ? `, ${buildingName(e.building)}` : ""}
        </span>
        {e.kind === "retake" && <span className={styles.examBadge}><Badge tone="danger">{e.individual ? "Твоя пересдача" : "Пересдача"}</Badge></span>}
        {e.result && <span className={styles.examBadge}><Badge tone={isDebtGrade(e.result) ? "danger" : "ok"}>Итог: {gradeLabel(e.result)}</Badge></span>}
      </span>
    </li>
  );
}

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const v = await requireStudent();
  const now = new Date();
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "session" || rawTab === "history" ? rawTab : "semester";
  const s = await getStudySummary(v, now);
  const today = mskDateKey(now);
  const riskIds = new Set(s.risks.map((r) => r.checkpointId));
  const retakes = s.session.filter((e) => e.kind === "retake");
  const exams = s.session.filter((e) => e.kind !== "retake");

  return (
    <>
      <PageHeader title="Учёба" subtitle={`${v.course} курс, ${currentSemester(v.course, now)} семестр`} />

      <Verdict s={s} now={now} />

      <div className={styles.tabs}>
        <Tabs
          label="Разделы учёбы"
          items={[
            { href: "/study", label: "Семестр", current: tab === "semester" },
            { href: "/study?tab=session", label: "Сессия", current: tab === "session" },
            { href: "/study?tab=history", label: "Зачётка", current: tab === "history" },
          ]}
        />
      </div>

      {tab === "semester" && (
        s.current.length ? (
          <>
            {/* Общее для всех предметов сказано один раз, в строке — только отличие */}
            <p className={styles.legend}>
              Предварительная оценка считается по сданным контрольным точкам. Остальные баллы набираются
              в оставшихся точках и на зачёте или экзамене.
            </p>
            <ul className={styles.list}>
              {s.current.map((e) => <SubjectCard key={e.id} e={e} today={today} riskIds={riskIds} />)}
            </ul>
          </>
        ) : (
          <EmptyState icon={<NotebookPen />} title="Дисциплин в этом семестре пока нет" text="Они появятся, когда учебный отдел утвердит план." />
        )
      )}

      {tab === "session" && (
        s.session.length ? (
          <>
            {retakes.length > 0 && (
              <Section title="Пересдачи" className={styles.firstSection}>
                <ul className={styles.exams}>{retakes.map((e) => <ExamRow key={e.id} e={e} />)}</ul>
              </Section>
            )}
            {exams.length > 0 && (
              <Section title="Зимняя сессия" className={retakes.length ? undefined : styles.firstSection}>
                <ul className={styles.exams}>{exams.map((e) => <ExamRow key={e.id} e={e} />)}</ul>
              </Section>
            )}
          </>
        ) : (
          <EmptyState icon={<GraduationCap />} title="Сессия пока не назначена" text="Даты экзаменов и зачётов появятся здесь, как только деканат утвердит расписание." />
        )
      )}

      {tab === "history" && (
        s.history.length ? (
          s.history.map((h, i) => (
            <Section
              key={h.semester}
              title={`${h.semester} семестр`}
              action={h.average !== null ? <span className={styles.avg}>средний балл <span className="num">{formatAverage(h.average)}</span></span> : undefined}
              className={i === 0 ? styles.firstSection : undefined}
            >
              <ul className={styles.grades} data-surface="paper">
                {h.entries.map((g) => (
                  <li key={`${h.semester}-${g.discipline}`} className={styles.grade}>
                    <span className={styles.gradeText}>
                      <span className={styles.gradeTitle}>{g.discipline}</span>
                      <span className={styles.gradeForm}>{CONTROL_FORM_LABEL[g.controlForm]}</span>
                    </span>
                    {g.finalGrade
                      ? <Badge tone={isDebtGrade(g.finalGrade) ? "danger" : "neutral"}>{gradeLabel(g.finalGrade)}</Badge>
                      : <Badge tone="warn">нет оценки</Badge>}
                  </li>
                ))}
              </ul>
            </Section>
          ))
        ) : (
          <EmptyState icon={<GraduationCap />} title="Оценок прошлых семестров пока нет" text="Они появятся после первой сессии." />
        )
      )}
    </>
  );
}
