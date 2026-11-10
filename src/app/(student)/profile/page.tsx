import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Info, LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { requireStudent } from "@/server/auth/viewer";
import { getProfile } from "@/server/profile";
import { PageHeader } from "@/ui/PageHeader";
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

export default async function ProfilePage() {
  const v = await requireStudent();
  const p = await getProfile(v);

  return (
    <>
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">{p.initials}</span>
        <PageHeader title={p.fullName} subtitle={`${p.course} курс, группа ${p.group}`} />
      </div>

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
