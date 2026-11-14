import type { Metadata } from "next";
import { CircleAlert, CircleCheck, Circle, GraduationCap, NotebookPen } from "lucide-react";
import { requireStudent } from "@/server/auth/viewer";
import { dayDiff, formatAverage, mskTime, plural, ruDateKey, ruRelativeDate, ruWeekdayShort } from "@/server/format";
import { currentSemester, getStudySummary, type EnrollmentView, type ExamView, type StudySummary } from "@/server/grades";
import { mskDateKey } from "@/server/time";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { Section } from "@/ui/Section";
import { Tabs } from "@/ui/Tabs";
import { buildingName, CONTROL_FORM_LABEL, EXAM_KIND_LABEL, gradeLabel, isDebtGrade, VERDICT_COPY } from "@/ui/student/labels";
import styles from "./study.module.css";

export const metadata: Metadata = { title: "Учёба" };

type Tab = "semester" | "session" | "history";
const POINTS: readonly [string, string, string] = ["балл", "балла", "баллов"];
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

/** Допуск в строке предмета: «есть» — обычным текстом, метка — только когда допуска нет или он не решён. */
function Admission({ admitted }: { admitted: boolean | null }) {
  if (admitted === true) return <span>допуск есть</span>;
  if (admitted === false) return <Badge tone="danger">Нет допуска</Badge>;
  return <Badge tone="warn">Допуск не решён</Badge>;
}

function Subject({ e, today, riskIds }: { e: EnrollmentView; today: string; riskIds: Set<number> }) {
  const done = e.checkpoints.filter((c) => c.score !== null).length;
  const remaining = e.checkpoints.filter((c) => c.score === null).reduce((sum, c) => sum + c.maxPoints, 0);
  const points = Math.min(100, Math.max(0, e.points ?? 0));
  const ahead = Math.min(100 - points, remaining);
  const rest = e.controlForm === "exam" ? "на экзамене" : "на зачёте";
  return (
    <li className={styles.subject}>
      <div className={styles.subjectHead}>
        <h3 className={styles.subjectTitle}>{e.discipline}</h3>
        <p className={styles.pointsLine}>
          <span className={`${styles.pointsNum} num`}>{points}</span>
          <span className={styles.pointsMax}> из 100</span>
        </p>
      </div>

      <div className={styles.subjectMeta}>
        <p className={styles.form}>
          {CONTROL_FORM_LABEL[e.controlForm]}, <Admission admitted={e.admitted} />
        </p>
        <p className={styles.prelim}>
          {e.finalGrade ? (
            <>итог: <strong>{gradeLabel(e.finalGrade)}</strong></>
          ) : e.pace ? (
            <>предварительно <strong>{e.pace.grade}</strong>, {e.pace.score} из {e.pace.max}</>
          ) : done > 0 ? (
            "пока мало оценок"
          ) : (
            "точки ещё впереди"
          )}
        </p>
      </div>

      <div
        className={styles.bar}
        role="meter"
        aria-label={`Баллы по дисциплине «${e.discipline}»`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={points}
        aria-valuetext={`${points} из 100${remaining ? `, в контрольных точках можно набрать ещё ${remaining}, остальное — ${rest}` : `, остальные баллы — ${rest}`}`}
      >
        <span className={styles.barFill} style={{ width: `${points}%` }} />
        {ahead > 0 && <span className={styles.barAhead} style={{ left: `${points}%`, width: `${ahead}%` }} />}
      </div>

      {e.checkpoints.length > 0 && (
        <details className={styles.checkpoints} open={e.checkpoints.some((c) => riskIds.has(c.id)) || undefined}>
          <summary className={styles.summary}>
            Контрольные точки: сдано {done} из {e.checkpoints.length}
          </summary>
          <ul className={styles.cpList}>
            {e.checkpoints.map((c) => {
              const overdue = c.score === null && c.dueDate < today;
              const state = c.score !== null ? "done" : overdue && c.required ? "overdue" : "open";
              const left = dayDiff(today, c.dueDate);
              return (
                <li key={c.id} className={styles.cp} data-state={state}>
                  <span className={styles.cpIcon} aria-hidden="true">
                    {state === "done" ? <CircleCheck /> : state === "overdue" ? <CircleAlert /> : <Circle />}
                  </span>
                  <span className={styles.cpBody}>
                    <span className={styles.cpTitle}>
                      {c.title}
                      {c.required && <span className={styles.required}>обязательная</span>}
                    </span>
                    <span className={styles.cpMeta}>
                      {c.score !== null
                        ? `${c.score} из ${c.maxPoints} ${plural(c.maxPoints, POINTS)}`
                        : overdue
                          ? `не сдана, срок прошёл ${ruDateKey(c.dueDate)}`
                          : `до ${ruDateKey(c.dueDate)}${left <= 7 ? ` (через ${left} ${plural(left, DAYS)})` : ""}, до ${c.maxPoints} ${plural(c.maxPoints, POINTS)}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
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
              {s.current.map((e) => <Subject key={e.id} e={e} today={today} riskIds={riskIds} />)}
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
