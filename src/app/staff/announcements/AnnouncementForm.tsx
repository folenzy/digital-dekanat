"use client";

import { CircleCheck, Megaphone } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AudienceOptions } from "@/server/announcements";
import { Button } from "@/ui/Button";
import { Field, FieldGroup, fieldAria } from "@/ui/Field";
import fs from "@/ui/Field.module.css";
import { publishedText } from "@/ui/staff/labels";
import { publishAnnouncementAction } from "../actions";
import type { AnnouncementFormState } from "../form-state";
import styles from "./announcements.module.css";

// Новое объявление: заголовок, текст, кому (всем / факультет / курс / группа), «Важное».
// Поля управляемые: после ошибки введённое остаётся, после публикации форма очищается.

type Audience = "all" | "faculty" | "course" | "group";

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "all", label: "Всем" },
  { value: "faculty", label: "Факультет" },
  { value: "course", label: "Курс" },
  { value: "group", label: "Группа" },
];

const TITLE_MAX = 120;
const BODY_MAX = 3000;

const EMPTY = { title: "", body: "", audience: "all" as Audience, facultyId: "", course: "", groupId: "", important: false };

export function AnnouncementForm({ options }: { options: AudienceOptions }) {
  const [v, setV] = useState(EMPTY);
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setV((s) => ({ ...s, [key]: value }));
  const summary = useRef<HTMLParagraphElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: AnnouncementFormState, form: FormData) => {
    const res = await publishAnnouncementAction(prev, form);
    if (res?.ok) setV(EMPTY);
    return res;
  }, null);
  const failed = state && !state.ok ? state : null;
  const err = (key: string) => failed?.fieldErrors[key];

  useEffect(() => {
    if (failed) summary.current?.focus();
  }, [failed]);

  const titleError = err("title");
  const bodyError = err("body");

  return (
    <form action={formAction} noValidate className={styles.form} data-surface="paper" aria-labelledby="new-title">
      <h2 id="new-title" className={styles.formTitle}>Новое объявление</h2>

      {state?.ok && (
        <p className={styles.success} role="status">
          <CircleCheck aria-hidden="true" />
          <span>{publishedText(state.recipients)}</span>
        </p>
      )}
      {failed && (
        <p ref={summary} tabIndex={-1} className={styles.failure} role="alert">{failed.error}</p>
      )}

      <Field id="ann-title" label="Заголовок" error={titleError}>
        <input
          id="ann-title"
          name="title"
          className={fs.input}
          maxLength={TITLE_MAX}
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          {...fieldAria("ann-title", { error: titleError })}
        />
      </Field>

      <Field id="ann-body" label="Текст" error={bodyError}>
        <textarea
          id="ann-body"
          name="body"
          className={fs.textarea}
          rows={5}
          maxLength={BODY_MAX}
          value={v.body}
          onChange={(e) => set("body", e.target.value)}
          {...fieldAria("ann-body", { error: bodyError })}
        />
      </Field>
      {v.body.length > BODY_MAX - 300 && <p className={styles.counter}>{v.body.length} из {BODY_MAX}</p>}

      <FieldGroup id="ann-audience" legend="Кому" error={err("audience")}>
        {AUDIENCES.map((a) => (
          <label key={a.value} className={fs.option}>
            <input
              type="radio"
              name="audience"
              value={a.value}
              checked={v.audience === a.value}
              onChange={() => set("audience", a.value)}
            />
            <span>{a.label}</span>
          </label>
        ))}
      </FieldGroup>

      {v.audience === "faculty" && (
        <Field id="ann-faculty" label="Какой факультет" error={err("audience.facultyId")}>
          <select
            id="ann-faculty"
            name="facultyId"
            className={fs.select}
            value={v.facultyId}
            onChange={(e) => set("facultyId", e.target.value)}
            {...fieldAria("ann-faculty", { error: err("audience.facultyId") })}
          >
            <option value="">Факультет не выбран</option>
            {options.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
      )}
      {v.audience === "course" && (
        <Field id="ann-course" label="Какой курс" error={err("audience.course")}>
          <select
            id="ann-course"
            name="course"
            className={fs.select}
            value={v.course}
            onChange={(e) => set("course", e.target.value)}
            {...fieldAria("ann-course", { error: err("audience.course") })}
          >
            <option value="">Курс не выбран</option>
            {options.courses.map((c) => <option key={c} value={c}>{c} курс</option>)}
          </select>
        </Field>
      )}
      {v.audience === "group" && (
        <Field id="ann-group" label="Какая группа" error={err("audience.groupId")}>
          <select
            id="ann-group"
            name="groupId"
            className={fs.select}
            value={v.groupId}
            onChange={(e) => set("groupId", e.target.value)}
            {...fieldAria("ann-group", { error: err("audience.groupId") })}
          >
            <option value="">Группа не выбрана</option>
            {options.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.course} курс)</option>)}
          </select>
        </Field>
      )}

      <label className={`${fs.option} ${styles.important}`}>
        <input
          type="checkbox"
          name="important"
          checked={v.important}
          onChange={(e) => set("important", e.target.checked)}
        />
        <span className={styles.importantText}>
          <span className={styles.importantTitle}>Важное</span>
          <span className={styles.importantHint}>Закрепится сверху в ленте студентов</span>
        </span>
      </label>

      <div className={styles.actions}>
        <Button type="submit" loading={pending} icon={<Megaphone />}>Опубликовать</Button>
      </div>
    </form>
  );
}
