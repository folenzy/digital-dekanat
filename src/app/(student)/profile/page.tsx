import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, CircleCheck, Info, Languages, LogOut, PencilLine, TriangleAlert } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { cleanStress, personName } from "@/lib/stress";
import { requireStudent } from "@/server/auth/viewer";
import { getProfile } from "@/server/profile";
import { getSettings, profileCompletion, type CompletionItem } from "@/server/settings";
import { languageLabel, NOTIFY_CATEGORIES } from "@/server/settings-options";
import { SettingsList } from "@/ui/profile/SettingsList";
import { SubmitButton } from "@/ui/SubmitButton";
import styles from "./profile.module.css";

export const metadata: Metadata = { title: "Профиль" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** ?saved=… после сохранения настройки: только известные значения, текст — фиксированный. */
const SAVED: Record<string, string> = {
  stress: "Ударения сохранены: сотрудники деканата увидят твоё имя с ними.",
  language: "Язык обучения сохранён.",
  notifications: "Настройки уведомлений сохранены.",
};

const MISSING: Record<CompletionItem, { href: string; label: string }> = {
  email: { href: "/dekanat", label: "добавить почту через деканат" },
  language: { href: "/profile/language", label: "выбрать язык обучения" },
  stress: { href: "/profile/stress", label: "расставить ударения в имени" },
};

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const v = await requireStudent();
  const [p, s, sp] = await Promise.all([getProfile(v), getSettings(v), searchParams]);
  const completion = profileCompletion(s);
  const saved = typeof sp.saved === "string" ? SAVED[sp.saved] : undefined;
  const hasStress = Object.keys(cleanStress(s.name, s.stress)).length > 0;
  const mutedCount = s.muted.length;

  return (
    <>
      <header className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">{p.initials}</span>
        <div className={styles.who}>
          {/* своё имя — так, как его увидят другие: с ударениями, если они расставлены */}
          <h1 className={styles.name}>{personName(s.name, { order: "official", stress: s.stress, show: true })}</h1>
          {p.email && <p className={styles.email}>{p.email}</p>}
          <p className={styles.group}>{p.course} курс, группа {p.group}</p>
        </div>
      </header>

      {saved && (
        <p className={styles.saved} role="status">
          <CircleCheck aria-hidden="true" />
          {saved}
        </p>
      )}

      <SettingsList
        label="Настройки профиля"
        rows={[
          {
            href: "/profile/language", icon: <Languages />, label: "Язык обучения",
            value: languageLabel(s.language) ?? "не выбран", attention: s.language === null,
          },
          {
            href: "/profile/stress", icon: <PencilLine />, label: "Ударения в имени",
            value: hasStress ? "расставлены" : "не указаны", attention: completion.missing.includes("stress"),
          },
          {
            href: "/profile/notifications", icon: <BellRing />, label: "Уведомления",
            value: mutedCount === 0 ? "все включены" : `выключено: ${mutedCount} из ${NOTIFY_CATEGORIES.length}`,
          },
        ]}
      />

      {completion.missing.length > 0 && (
        <section className={styles.complete} aria-labelledby="complete-title">
          <TriangleAlert aria-hidden="true" />
          <div>
            <h2 id="complete-title" className={styles.completeTitle}>
              Заполни профиль <span className="num">({completion.done} из {completion.total})</span>
            </h2>
            <p className={styles.completeText}>
              Осталось:{" "}
              {completion.missing.map((m, i) => (
                <span key={m}>
                  {i > 0 && ", "}
                  <Link href={MISSING[m].href}>{MISSING[m].label}</Link>
                </span>
              ))}
              .
            </p>
          </div>
        </section>
      )}

      <section className={styles.sheet} data-surface="paper" aria-labelledby="study-data">
        <h2 id="study-data" className={styles.sheetTitle}>Учёба</h2>
        <dl className={styles.list}>
          <Row label="Факультет">{p.faculty.name}</Row>
          <Row label="Направление">{p.program.code} {p.program.name}</Row>
          {p.program.profile && <Row label="Профиль">{p.program.profile}</Row>}
          <Row label="Курс и группа">{p.course} курс, {p.group}</Row>
          <Row label="Форма обучения">{p.studyForm}</Row>
          <Row label="Основа обучения">{p.funding}</Row>
          <Row label="Номер студенческого"><span className="num">{p.recordBookNo}</span></Row>
        </dl>
      </section>

      <section className={styles.sheet} data-surface="paper" aria-labelledby="contacts">
        <h2 id="contacts" className={styles.sheetTitle}>Связь</h2>
        <dl className={styles.list}>
          <Row label="Почта">{p.email ?? "не указана"}</Row>
          <Row label="Куратор группы">{p.curatorName ?? "не назначен"}</Row>
        </dl>
        <p className={styles.hint}>
          Если в данных ошибка, напиши в <Link href="/dekanat">деканат</Link>: исправим карточку студента.
        </p>
      </section>

      <div className={styles.actions}>
        <Link href="/about" className={styles.about}>
          <Info aria-hidden="true" />
          <span>
            <span className={styles.aboutTitle}>О проекте</span>
            <span className={styles.aboutText}>Концепт для конкурса, тестовые данные, как устроена защита</span>
          </span>
        </Link>
        <form action={logoutAction}>
          <SubmitButton icon={<LogOut />} full>Выйти</SubmitButton>
        </form>
      </div>
    </>
  );
}
