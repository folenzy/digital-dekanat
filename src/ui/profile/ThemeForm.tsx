import Link from "next/link";
import { THEMES, type Theme } from "@/lib/theme";
import { setThemeAction } from "@/app/theme-action";
import { SubmitButton } from "../SubmitButton";
import options from "./Options.module.css";
import styles from "./ThemeForm.module.css";

// Выбор темы: две карточки с маленьким образцом экрана. Обычная форма с radio — работает без JavaScript.

export function ThemeForm({ current, cancelHref }: { current: Theme; cancelHref: string }) {
  return (
    <form action={setThemeAction} className={options.form}>
      <fieldset className={options.group}>
        <legend className="sr-only">Тема оформления</legend>
        <div className={styles.grid}>
          {THEMES.map((t) => (
            <label key={t.code} className={styles.card}>
              <input type="radio" name="theme" value={t.code} defaultChecked={current === t.code} className="sr-only" />
              {/* Образец всегда в цветах своей темы, какая бы ни была включена сейчас */}
              <span className={styles.sample} data-theme={t.code} aria-hidden="true">
                <span className={styles.sampleBar} />
                <span className={styles.sampleHero} />
                <span className={styles.sampleCard}>
                  <span className={styles.samplePill} />
                  <span className={styles.sampleLine} />
                </span>
                <span className={styles.sampleCard}>
                  <span className={styles.samplePill} data-alt />
                  <span className={styles.sampleLine} />
                </span>
              </span>
              <span className={styles.caption}>
                <span className={styles.mark} aria-hidden="true" />
                <span>
                  <span className={styles.label}>{t.label}</span>
                  <span className={styles.hint}>{t.hint}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={styles.note}>Тема запоминается на этом устройстве: на телефоне и на компьютере можно выбрать разные.</p>
      <div className={options.actions}>
        <Link href={cancelHref} className={options.cancel}>Отменить</Link>
        <SubmitButton variant="primary">Сохранить</SubmitButton>
      </div>
    </form>
  );
}
