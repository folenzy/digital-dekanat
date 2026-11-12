import { NOTIFY_CATEGORIES } from "@/server/settings-options";

// Разбор форм настроек профиля. Здесь только приведение типов: что из этого допустимо,
// решает сервер (cleanStress, cleanMuted, saveStudyLanguage).

const index = (v: FormDataEntryValue | null): number | undefined =>
  typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : undefined;

/** Ударения из формы редактора: поля last / first / middle с номером буквы; пусто — «не указывать». */
export function stressFromForm(form: FormData): { last?: number; first?: number; middle?: number } {
  const out: { last?: number; first?: number; middle?: number } = {};
  for (const key of ["last", "first", "middle"] as const) {
    const i = index(form.get(key));
    if (i !== undefined) out[key] = i;
  }
  return out;
}

/** Выключенные категории: всё, что не отмечено галочкой «получать» (поле on). */
export function mutedFromForm(form: FormData): string[] {
  const on = new Set(form.getAll("on").filter((v): v is string => typeof v === "string"));
  return NOTIFY_CATEGORIES.map((c) => c.code).filter((c) => !on.has(c));
}
