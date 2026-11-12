"use client";

import Link from "next/link";
import { useState } from "react";
import { needsStress, personName, type NameParts, type NameStress } from "@/lib/stress";
import { SubmitButton } from "../SubmitButton";
import styles from "./StressEditor.module.css";

// Редактор ударений в ФИО. В каждом слове гласные — плитки-переключатели (radio): нажал на ударную — готово.
// Работает и без JavaScript (обычная форма с radio); со скриптом сверху живьём видно, как имя увидят другие.

type Part = { key: keyof NameStress; legend: string; word: string };

type StressEditorProps = {
  name: NameParts;
  stress: NameStress;
  showStress: boolean;
  /** Серверное действие сохранения. */
  action: (form: FormData) => void | Promise<void>;
  cancelHref: string;
};

const VOWELS = "аеёиоуыэюя";
const isVowel = (ch: string) => VOWELS.includes(ch.toLowerCase());

export function StressEditor({ name, stress, showStress, action, cancelHref }: StressEditorProps) {
  const [value, setValue] = useState<NameStress>(stress);
  const parts: Part[] = [
    { key: "last", legend: "Фамилия", word: name.lastName },
    { key: "first", legend: "Имя", word: name.firstName },
    ...(name.middleName ? [{ key: "middle" as const, legend: "Отчество", word: name.middleName }] : []),
  ];

  const set = (key: keyof NameStress, index: number | undefined) =>
    setValue((v) => {
      const next = { ...v };
      if (index === undefined) delete next[key];
      else next[key] = index;
      return next;
    });

  return (
    <form action={action} className={styles.form}>
      <div className={styles.preview} data-surface="ink">
        <p className={styles.previewLabel}>Другие увидят</p>
        <p className={styles.previewName} aria-live="polite">
          {personName(name, { order: "official", stress: value, show: true })}
        </p>
      </div>

      {parts.map(({ key, legend, word }) => {
        const needed = needsStress(word);
        return (
          <fieldset key={key} className={styles.word}>
            <legend className={styles.legend}>{legend}</legend>
            {needed ? (
              <>
                <div className={styles.letters}>
                  {[...word].map((ch, i) =>
                    isVowel(ch) ? (
                      <label key={i} className={styles.vowel}>
                        <input
                          type="radio"
                          name={key}
                          value={i}
                          className="sr-only"
                          checked={value[key] === i}
                          onChange={() => set(key, i)}
                        />
                        <span className={styles.tile} aria-hidden="true">{ch}</span>
                        <span className="sr-only">ударение на «{ch}», буква {i + 1}</span>
                      </label>
                    ) : (
                      <span key={i} className={styles.consonant} aria-hidden="true">{ch}</span>
                    ),
                  )}
                </div>
                <label className={styles.none}>
                  <input
                    type="radio"
                    name={key}
                    value=""
                    checked={value[key] === undefined}
                    onChange={() => set(key, undefined)}
                  />
                  не указывать
                </label>
              </>
            ) : (
              <p className={styles.obvious}>
                <span className={styles.plain}>{word}</span> — здесь ударение очевидно, выбирать не нужно.
              </p>
            )}
          </fieldset>
        );
      })}

      <label className={styles.show} data-surface="paper">
        <span>
          <span className={styles.showTitle}>Показывать ударения</span>
          <span className={styles.showHint}>Сними отметку, если не хочешь видеть ударения в именах других людей.</span>
        </span>
        <input type="checkbox" name="show" defaultChecked={showStress} className={styles.check} />
      </label>

      <div className={styles.actions}>
        <Link href={cancelHref} className={styles.cancel}>Отменить</Link>
        <SubmitButton variant="primary">Сохранить</SubmitButton>
      </div>
    </form>
  );
}
