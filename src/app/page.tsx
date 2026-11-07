import Link from "next/link";
import { ConceptBanner } from "@/ui/ConceptBanner";
import { Logo } from "@/ui/Logo";

// Временная главная до Task 12: её заменит экран «Сегодня» в (student)/page.tsx.
export default function Home() {
  return (
    <>
      <ConceptBanner />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px var(--gutter)" }}>
        <Logo size={40} subtitle />
        <h1 style={{ marginTop: 32, fontSize: "var(--text-3xl)" }}>Кабинет студента Университета Ориентир</h1>
        <p style={{ marginTop: 12 }} className="text-muted">Экраны кабинета появятся здесь.</p>
        <p style={{ marginTop: 24 }}>
          <Link href="/login">Войти</Link>
        </p>
      </main>
    </>
  );
}
