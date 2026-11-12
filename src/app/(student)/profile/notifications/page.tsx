import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requireStudent } from "@/server/auth/viewer";
import { getSettings } from "@/server/settings";
import { NOTIFY_CATEGORIES } from "@/server/settings-options";
import { SettingsPage } from "@/ui/profile/SettingsList";
import { SubmitButton } from "@/ui/SubmitButton";
import styles from "@/ui/profile/Options.module.css";
import { saveNotificationsAction } from "../actions";

export const metadata: Metadata = { title: "Настройка уведомлений" };

export default async function NotificationSettingsPage() {
  const v = await requireStudent();
  const s = await getSettings(v);
  return (
    <SettingsPage
      backHref="/profile"
      title="Уведомления"
      lead="Выбери, о чём сообщать в колокольчике. Выключенное не пропадает: включишь обратно — увидишь всё, что пришло."
    >
      <form action={saveNotificationsAction} className={styles.form}>
        <fieldset className={styles.group}>
          <legend className="sr-only">О чём сообщать</legend>
          <ul className={styles.list} data-surface="paper">
            <li>
              <div className={styles.option} data-locked>
                <Lock aria-hidden="true" className={styles.lock} />
                <span>
                  <span className={styles.optionLabel}>Ответы деканата по обращениям</span>
                  <span className={styles.optionHint}>Всегда включены: иначе можно пропустить ответ или просьбу уточнить.</span>
                </span>
              </div>
            </li>
            {NOTIFY_CATEGORIES.map((c) => (
              <li key={c.code}>
                <label className={styles.option}>
                  <input type="checkbox" name="on" value={c.code} defaultChecked={!s.muted.includes(c.code)} />
                  <span>
                    <span className={styles.optionLabel}>{c.label}</span>
                    <span className={styles.optionHint}>{c.hint}</span>
                  </span>
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
