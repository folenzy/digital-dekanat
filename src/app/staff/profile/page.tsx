import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info, LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { requireStaff } from "@/server/auth/viewer";
import { getStaffProfile } from "@/server/profile";
import { PageHeader } from "@/ui/PageHeader";
import { SubmitButton } from "@/ui/SubmitButton";
import styles from "./profile.module.css";

export const metadata: Metadata = { title: "Профиль" };

export default async function StaffProfilePage() {
  const v = await requireStaff();
  const p = await getStaffProfile(v);
  if (!p) notFound();

  return (
    <>
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">{p.initials}</span>
        <PageHeader title={p.fullName} subtitle={p.position} />
      </div>

      <section className={styles.sheet} data-surface="paper" aria-labelledby="deps-title">
        <h2 id="deps-title" className={styles.sheetTitle}>Отделы</h2>
        <ul className={styles.list}>
          {p.departments.map((d) => <li key={d}>{d}</li>)}
        </ul>
        <p className={styles.hint}>Обращения этих отделов попадают в твою очередь; ответить может любой сотрудник отдела.</p>
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
