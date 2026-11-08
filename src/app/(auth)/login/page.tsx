import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth/viewer";
import { ConceptBanner } from "@/ui/ConceptBanner";
import { Logo } from "@/ui/Logo";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Вход" };

/** Единственная причина, которую показываем; любое другое значение ?reason игнорируется. */
const EXPIRED_TEXT = "Сессия завершилась — возможно, ночью обновились демо-данные. Войди снова";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect(viewer.role === "staff" ? "/staff" : "/");
  const { reason } = await searchParams;

  return (
    <div className={styles.page}>
      <ConceptBanner />
      <main id="main" className={styles.main}>
        <div className={styles.intro}>
          <Logo size={36} subtitle />
          <p className={styles.motto}>Деканат, до которого можно достучаться</p>
          <p className={styles.lead}>
            Кабинет студента Университета Ориентир: пары, оценки и обращения в деканат. Видно, кто занимается
            твоим вопросом и когда ждать ответа.
          </p>
        </div>

        <div className={styles.panel}>
          <h1 className={styles.title}>Вход в кабинет</h1>
          {reason === "expired" && (
            <p className={styles.notice} role="status">{EXPIRED_TEXT}</p>
          )}
          <LoginForm />
          <p className={styles.help}>
            Логины для проверки — в README и в комментарии к конкурсной работе.{" "}
            <Link href="/about">О проекте</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
