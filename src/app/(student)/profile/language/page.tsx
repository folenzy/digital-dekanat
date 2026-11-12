import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/server/auth/viewer";
import { getSettings } from "@/server/settings";
import { STUDY_LANGUAGES } from "@/server/settings-options";
import { SettingsPage } from "@/ui/profile/SettingsList";
import { SubmitButton } from "@/ui/SubmitButton";
import styles from "@/ui/profile/Options.module.css";
import { saveLanguageAction } from "../actions";

export const metadata: Metadata = { title: "Язык обучения" };

export default async function LanguagePage({ searchParams }: PageProps<"/profile/language">) {
  const v = await requireStudent();
  const [s, sp] = await Promise.all([getSettings(v), searchParams]);
  return (
    <SettingsPage
      backHref="/profile"
      title="Язык обучения"
      lead="Иностранный язык, который ты изучаешь. По нему деканат формирует языковые группы."
    >
      <form action={saveLanguageAction} className={styles.form}>
        {sp.error === "1" && <p className={styles.error} role="alert">Выбери язык из списка.</p>}
        <fieldset className={styles.group}>
          <legend className="sr-only">Язык обучения</legend>
          <ul className={styles.list} data-surface="paper">
            {STUDY_LANGUAGES.map((l) => (
              <li key={l.code}>
                <label className={styles.option}>
                  <input type="radio" name="language" value={l.code} defaultChecked={s.language === l.code} required />
                  <span className={styles.optionLabel}>{l.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className={styles.actions}>
          <Link href="/profile" className={styles.cancel}>Отменить</Link>
          <SubmitButton variant="primary">Сохранить</SubmitButton>
        </div>
      </form>
    </SettingsPage>
  );
}
