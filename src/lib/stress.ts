// Ударения в ФИО: человек сам отмечает ударную гласную в фамилии, имени и отчестве, чтобы его имя
// не коверкали. Чистые функции без зависимостей — годятся и для сервера, и для клиента.

/** Индекс ударной гласной в каждой части имени (позиция буквы в слове, с нуля). */
export type NameStress = { last?: number; first?: number; middle?: number };
export type NameParts = { lastName: string; firstName: string; middleName: string | null };

const VOWELS = "аеёиоуыэюя";
const ACUTE = "́"; // комбинируемый знак ударения

const isVowel = (ch: string | undefined) => !!ch && VOWELS.includes(ch.toLowerCase());
const hasYo = (word: string) => /ё/i.test(word);

/** Позиции гласных в слове. */
export function vowelIndexes(word: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < word.length; i++) if (isVowel(word[i])) out.push(i);
  return out;
}

/** Нужно ли слову ударение: «ё» всегда ударная, а в слове с одной гласной выбирать нечего. */
export function needsStress(word: string | null | undefined): boolean {
  if (!word || hasYo(word)) return false;
  return vowelIndexes(word).length >= 2;
}

function validIndex(word: string | null | undefined, index: unknown): index is number {
  return needsStress(word) && typeof index === "number" && Number.isInteger(index) && isVowel(word![index]);
}

/** Слово со знаком ударения после гласной с этим индексом; неверный индекс — слово как есть. */
export function withStress(word: string, index: number | null | undefined): string {
  if (!validIndex(word, index)) return word;
  return word.slice(0, index + 1) + ACUTE + word.slice(index + 1);
}

/**
 * Оставляет от присланных ударений только корректные: число, указывающее на гласную своего слова.
 * Всё остальное (согласные, выход за границы, строки, чужие ключи) отбрасывается.
 */
export function cleanStress(person: NameParts, raw: unknown): NameStress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: NameStress = {};
  if (validIndex(person.lastName, src.last)) out.last = src.last;
  if (validIndex(person.firstName, src.first)) out.first = src.first;
  if (validIndex(person.middleName, src.middle)) out.middle = src.middle;
  return out;
}

/** Ударение задано для каждой части имени, которой оно нужно. */
export function isStressComplete(person: NameParts, raw: unknown): boolean {
  const s = cleanStress(person, raw);
  return (
    (!needsStress(person.lastName) || s.last !== undefined) &&
    (!needsStress(person.firstName) || s.first !== undefined) &&
    (!needsStress(person.middleName) || s.middle !== undefined)
  );
}

type NameOptions = {
  /** official — «Фамилия Имя Отчество» (студент в документах), display — «Имя Отчество Фамилия» (как представляется). */
  order: "official" | "display";
  /** Сохранённые ударения владельца имени (из БД, могут быть любыми — проверяются). */
  stress: unknown;
  /** Показывать ли ударения тому, кто смотрит (его настройка). */
  show: boolean;
};

/** Имя человека так, как его увидит другой пользователь. */
export function personName(p: NameParts, { order, stress, show }: NameOptions): string {
  const s = show ? cleanStress(p, stress) : {};
  const last = withStress(p.lastName, s.last);
  const first = withStress(p.firstName, s.first);
  const middle = p.middleName ? withStress(p.middleName, s.middle) : null;
  const parts = order === "official" ? [last, first, middle] : [first, middle, last];
  return parts.filter(Boolean).join(" ");
}
