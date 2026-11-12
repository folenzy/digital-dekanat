import "server-only";
import { eq } from "drizzle-orm";
import { cleanStress, isStressComplete, type NameParts, type NameStress } from "@/lib/stress";
import type { StudentViewer, Viewer } from "./auth/viewer";
import { db } from "./db/client";
import { staff, students, users } from "./db/schema";
import { cleanMuted, languageLabel, type NotifyCategory } from "./settings-options";

// Настройки профиля: ударения в ФИО, язык обучения, уведомления.
// Каждая функция пишет только в запись того, кто смотрит (id — из Viewer, не из формы).

export type Settings = {
  name: NameParts;
  email: string | null;
  stress: NameStress;
  showStress: boolean;
  /** Код языка обучения; у сотрудника и пока не выбран — null. */
  language: string | null;
  muted: NotifyCategory[];
};

type Own = { name: NameParts; stress: unknown; email: string | null; language: string | null };

async function ownName(v: Viewer): Promise<Own> {
  if (v.role === "student") {
    const [r] = await db
      .select({
        lastName: students.lastName, firstName: students.firstName, middleName: students.middleName,
        stress: students.nameStress, email: students.email, language: students.studyLanguage,
      })
      .from(students).where(eq(students.id, v.studentId)).limit(1);
    if (!r) throw new Error("Профиль студента не найден");
    const { stress, email, language, ...name } = r;
    return { name, stress, email, language };
  }
  const [r] = await db
    .select({ lastName: staff.lastName, firstName: staff.firstName, middleName: staff.middleName, stress: staff.nameStress })
    .from(staff).where(eq(staff.id, v.staffId)).limit(1);
  if (!r) throw new Error("Профиль сотрудника не найден");
  const { stress, ...name } = r;
  return { name, stress, email: null, language: null };
}

export async function getSettings(v: Viewer): Promise<Settings> {
  const [own, [u]] = await Promise.all([
    ownName(v),
    db.select({ showStress: users.showStress, muted: users.notifyMuted }).from(users).where(eq(users.id, v.userId)).limit(1),
  ]);
  return {
    name: own.name,
    email: own.email,
    stress: cleanStress(own.name, own.stress),
    showStress: u?.showStress ?? true,
    language: languageLabel(own.language) ? own.language : null,
    muted: cleanMuted(u?.muted),
  };
}

/**
 * Сохраняет ударения в своём ФИО (проверяются по своему же имени из БД) и свою настройку
 * «показывать ударения в именах других». Возвращает то, что сохранено.
 */
export async function saveNameStress(v: Viewer, raw: unknown, showStress: boolean): Promise<NameStress> {
  const { name } = await ownName(v);
  const stress = cleanStress(name, raw);
  const value = Object.keys(stress).length > 0 ? stress : null;
  await db.transaction(async (tx) => {
    if (v.role === "student") await tx.update(students).set({ nameStress: value }).where(eq(students.id, v.studentId));
    else await tx.update(staff).set({ nameStress: value }).where(eq(staff.id, v.staffId));
    await tx.update(users).set({ showStress: showStress === true }).where(eq(users.id, v.userId));
  });
  return stress;
}

/** Язык обучения: только код из списка. false — код не подошёл, ничего не изменено. */
export async function saveStudyLanguage(v: StudentViewer, code: unknown): Promise<boolean> {
  if (v.role !== "student" || typeof code !== "string" || !languageLabel(code)) return false;
  await db.update(students).set({ studyLanguage: code }).where(eq(students.id, v.studentId));
  return true;
}

/** Выключенные категории уведомлений. Возвращает то, что сохранено. */
export async function saveNotifyMuted(v: Viewer, raw: unknown): Promise<NotifyCategory[]> {
  const muted = cleanMuted(raw);
  await db.update(users).set({ notifyMuted: muted }).where(eq(users.id, v.userId));
  return muted;
}

export type CompletionItem = "email" | "language" | "stress";

/** Плашка «Заполни профиль»: почта, язык обучения, ударения. */
export function profileCompletion(s: Settings): { done: number; total: number; missing: CompletionItem[] } {
  const checks: [CompletionItem, boolean][] = [
    ["email", !!s.email],
    ["language", s.language !== null],
    ["stress", isStressComplete(s.name, s.stress)],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([k]) => k);
  return { done: checks.length - missing.length, total: checks.length, missing };
}
