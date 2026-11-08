import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { FilePlus2, Inbox, Search, SearchX } from "lucide-react";
import { listMyAppeals } from "@/server/appeals/service";
import { APPEAL_TYPES, isAppealTypeCode } from "@/server/appeals/types";
import { requireStudent } from "@/server/auth/viewer";
import { searchKb, type KbHit } from "@/server/kb";
import { AppealListCard } from "@/ui/appeals/AppealListCard";
import { Button } from "@/ui/Button";
import { EmptyState } from "@/ui/EmptyState";
import { PageHeader } from "@/ui/PageHeader";
import { Section } from "@/ui/Section";
import { Tabs } from "@/ui/Tabs";
import { writeToStaffHref } from "./form-state";
import { wizardHref } from "./wizard";
import styles from "./dekanat.module.css";

export const metadata: Metadata = { title: "Деканат" };

const ASK_MIN = 3;
const ASK_MAX = 200;
const EXAMPLES = ["справка в военкомат", "пересдача", "когда приходит стипендия"];

function Answer({ hit, q, open }: { hit: KbHit; q: string; open: boolean }) {
  const type = isAppealTypeCode(hit.appealTypeCode) ? hit.appealTypeCode : null;
  return (
    <article className={styles.answer} data-surface="paper">
      <details className={styles.details} open={open || undefined}>
        <summary className={styles.summary}>
          <h3 className={styles.question}>{hit.question}</h3>
          <span className={styles.excerpt}>{hit.answerExcerpt}</span>
          <span className={styles.toggle} aria-hidden="true" />
        </summary>
        <p className={styles.full}>{hit.answer}</p>
      </details>
      <div className={styles.answerActions}>
        {type && (
          <Button href={wizardHref({ type })} variant="secondary" aria-label={`Оформить: ${APPEAL_TYPES[type].title}`}>
            Оформить
          </Button>
        )}
        <Button href={writeToStaffHref(hit.topic, q)} variant="ghost">Не помогло — написать сотруднику</Button>
      </div>
    </article>
  );
}

export default async function DekanatPage({ searchParams }: PageProps<"/dekanat">) {
  const v = await requireStudent();
  const now = new Date();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, ASK_MAX).trim();
  const filter = sp.filter === "done" ? "done" : "active";
  const searching = q.length >= ASK_MIN;
  const [hits, appeals] = await Promise.all([searching ? searchKb(q) : [], listMyAppeals(v, filter, now)]);

  return (
    <>
      <PageHeader
        title="Деканат"
        subtitle="Спроси — частые вопросы уже разобраны. Нет готового ответа — обращение само уйдёт в нужный отдел."
      />

      <section className={styles.ask} data-surface="ink">
        <Form action="/dekanat" role="search" className={styles.askForm}>
          <h2 id="ask-title" className={styles.askTitle}>
            <label htmlFor="ask-q">Спроси деканат</label>
          </h2>
          <div className={styles.askRow}>
            <input
              key={q}
              id="ask-q"
              name="q"
              type="search"
              className={styles.askInput}
              defaultValue={q}
              maxLength={ASK_MAX}
              placeholder="Например, справка в военкомат"
              autoComplete="off"
              enterKeyHint="search"
            />
            <Button type="submit" icon={<Search />}>Найти</Button>
          </div>
          {q.length > 0 && !searching && (
            <p className={styles.askNote} role="status">
              Напиши хотя бы три буквы — например, «справка» или «стипендия».
            </p>
          )}
          {q.length === 0 && (
            <p className={styles.askExamples}>
              Часто спрашивают:{" "}
              {EXAMPLES.map((e, i) => (
                <span key={e}>
                  <Link href={`/dekanat?q=${encodeURIComponent(e)}`}>{e}</Link>
                  {i < EXAMPLES.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          )}
        </Form>
      </section>

      {searching && (
        hits.length > 0 ? (
          <section className={styles.answers} aria-labelledby="answers-title">
            <h2 id="answers-title" className={styles.answersTitle}>Ответы деканата</h2>
            <p className={styles.answersFor}>По запросу «{q}»</p>
            <div className={styles.answerList}>
              {hits.map((h, i) => <Answer key={h.id} hit={h} q={q} open={i === 0} />)}
            </div>
          </section>
        ) : (
          <div className={styles.answers}>
            <EmptyState
              icon={<SearchX />}
              title="Готового ответа нет"
              text={<>По запросу «{q}» в базе ответов ничего не нашлось. Напиши сотруднику: вопрос уйдёт в нужный отдел, а ответ придёт сюда же.</>}
              action={<Button href={writeToStaffHref(undefined, q)}>Написать сотруднику</Button>}
            />
          </div>
        )
      )}

      <div className={styles.newRow} data-surface="paper">
        <div className={styles.newText}>
          <p className={styles.newTitle}>Знаешь, что нужно?</p>
          <p className={styles.newLead}>Справку, заявление или вопрос сотруднику оформишь в три шага.</p>
        </div>
        <Button href="/dekanat/new" variant="secondary" icon={<FilePlus2 />}>Новое обращение</Button>
      </div>

      <Section title="Мои обращения" id="my-appeals">
        <Tabs
          label="Какие обращения показать"
          size="small"
          items={[
            { href: "/dekanat", label: "Активные", current: filter === "active" },
            { href: "/dekanat?filter=done", label: "Завершённые", current: filter === "done" },
          ]}
        />
        {appeals.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            titleAs="h3"
            title={filter === "active" ? "Активных обращений нет" : "Завершённых обращений пока нет"}
            text={filter === "active"
              ? "Когда отправишь обращение, здесь будет видно, на каком оно этапе и когда ждать ответ."
              : "Сюда попадут обращения, которые закрыты или отклонены."}
          />
        ) : (
          <ul className={styles.list}>
            {appeals.map((a) => <li key={a.id}><AppealListCard appeal={a} now={now} /></li>)}
          </ul>
        )}
      </Section>
    </>
  );
}
