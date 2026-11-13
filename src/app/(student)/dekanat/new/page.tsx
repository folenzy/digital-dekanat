import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock3, FileText, GraduationCap, Wallet, type LucideIcon } from "lucide-react";
import { getAppealRoute } from "@/server/appeals/catalog";
import { slaDueForType } from "@/server/appeals/sla";
import { APPEAL_TYPES, type AppealTopic, type AppealTypeCode } from "@/server/appeals/types";
import { requireStudent } from "@/server/auth/viewer";
import { mskTime, ruDate } from "@/server/format";
import { listAppealDisciplines } from "@/server/grades";
import { slaPhrase, TOPIC_META, TOPICS } from "@/ui/appeals/labels";
import { PageHeader } from "@/ui/PageHeader";
import { initialValues, parseWizardParams, typesOfTopic, wizardHref, type WizardState } from "../wizard";
import { AppealForm } from "./AppealForm";
import styles from "./new.module.css";

export const metadata: Metadata = { title: "Новое обращение" };

const TOPIC_ICON: Record<AppealTopic, LucideIcon> = {
  certificates: FileText,
  study: GraduationCap,
  stipend: Wallet,
};

const STEPS = ["Тема", "Что нужно", "Детали"] as const;

/** Подсказка в поле «Куда нужна справка» — под конкретную справку. */
const DESTINATION_PLACEHOLDER: Partial<Record<AppealTypeCode, string>> = {
  cert_military: "Например, военный комиссариат Центрального района",
  cert_social: "Например, управление соцзащиты Советского района",
  cert_benefit: "Например, центр занятости, для пособия",
  cert_grades: "Например, для перевода в другой вуз",
};

/** Шаги мастера: пройденные — ссылки назад (с тем же текстом), текущий отмечен aria-current. */
function Steps({ state }: { state: WizardState }) {
  const topic = state.step > 1 ? (state as { topic: AppealTopic }).topic : undefined;
  const hrefOf = (n: number) => (n === 1 ? wizardHref({ text: state.text }) : wizardHref({ topic, text: state.text }));
  return (
    <nav aria-label="Шаги нового обращения" className={styles.steps}>
      <ol className={styles.stepList}>
        {STEPS.map((label, i) => {
          const n = i + 1;
          const status = n < state.step ? "done" : n === state.step ? "current" : "todo";
          const content = <><span className={styles.stepNum} aria-hidden="true">{n}</span>{label}</>;
          return (
            <li key={label} className={styles.step} data-state={status}>
              {status === "done" ? (
                <Link href={hrefOf(n)} className={styles.stepLink}>
                  <span className="sr-only">Шаг {n}: </span>{content}
                </Link>
              ) : (
                <span className={styles.stepLink} aria-current={status === "current" ? "step" : undefined}>
                  <span className="sr-only">Шаг {n}: </span>{content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Текст из «Спроси деканат» едет в форму — показываем, что он не потерялся. */
function CarriedText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className={styles.carried}>
      Твой вопрос перенесётся в обращение: <q className={styles.carriedText}>{text}</q>
    </p>
  );
}

function TopicStep({ text }: { text: string }) {
  return (
    <>
      <PageHeader kicker="Новое обращение" title="О чём обращение?" subtitle="Выбери тему — обращение само уйдёт в нужный отдел." />
      <CarriedText text={text} />
      <ul className={styles.choices}>
        {TOPICS.map((t) => {
          const Icon = TOPIC_ICON[t];
          return (
            <li key={t}>
              <Link href={wizardHref({ topic: t, text })} className={styles.choice} data-surface="paper">
                <span className={styles.choiceIcon} aria-hidden="true"><Icon /></span>
                <span className={styles.choiceBody}>
                  <span className={styles.choiceTitle}>{TOPIC_META[t].title}</span>
                  <span className={styles.choiceText}>{TOPIC_META[t].text}</span>
                </span>
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TypeStep({ topic, text }: { topic: AppealTopic; text: string }) {
  return (
    <>
      <PageHeader kicker="Новое обращение" title={TOPIC_META[topic].title} subtitle="Что именно нужно?" />
      <CarriedText text={text} />
      <ul className={styles.choices}>
        {typesOfTopic(topic).map((code) => {
          const t = APPEAL_TYPES[code];
          return (
            <li key={code}>
              <Link href={wizardHref({ type: code, text })} className={styles.choice} data-surface="paper">
                <span className={styles.choiceBody}>
                  <span className={styles.choiceTitle}>{t.title}</span>
                  <span className={styles.choiceText}>{t.hint}</span>
                  <span className={styles.choiceSla}>
                    <Clock3 aria-hidden="true" />
                    {slaPhrase(t.slaDays)}
                  </span>
                </span>
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default async function NewAppealPage({ searchParams }: PageProps<"/dekanat/new">) {
  const v = await requireStudent();
  const now = new Date();
  const state = parseWizardParams(await searchParams);

  if (state.step === 1) return <><Steps state={state} /><TopicStep text={state.text} /></>;
  if (state.step === 2) return <><Steps state={state} /><TypeStep topic={state.topic} text={state.text} /></>;

  const def = APPEAL_TYPES[state.type];
  const [route, disciplines] = await Promise.all([
    getAppealRoute(state.type),
    state.type === "study_retake" ? listAppealDisciplines(v, now) : undefined,
  ]);
  const due = slaDueForType(state.type, now);
  const slip = (
    <div className={styles.slip}>
      <p className={styles.slipLine}>
        Уйдёт в: <strong>{route?.department.name ?? "нужный отдел"}</strong>, ответ до <strong>{ruDate(due)}</strong>
      </p>
      <p className={styles.slipNote}>
        Срок считаем в рабочих днях, до {mskTime(due)} по Москве. Статус и ответ появятся в карточке обращения.
      </p>
    </div>
  );

  return (
    <>
      <Steps state={state} />
      <PageHeader kicker="Новое обращение" title={def.title} subtitle={def.hint} />
      <AppealForm
        type={state.type}
        kind={def.kind}
        topic={def.topic}
        initial={initialValues(state.type, state.text, state.prefill)}
        disciplines={disciplines}
        destinationPlaceholder={DESTINATION_PLACEHOLDER[state.type] ?? "Например, по месту требования"}
        slip={slip}
      />
    </>
  );
}
