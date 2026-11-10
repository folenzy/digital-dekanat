import { plural } from "@/server/format";

// Обратный отсчёт до обещанного срока: «осталось 5 ч 12 мин» / «просрочено на 2 ч». Без БД — и для клиента.

const MIN = 60_000;
const DAYS: readonly [string, string, string] = ["день", "дня", "дней"];

function span(totalMin: number): string {
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days} ${plural(days, DAYS)} ${hours} ч` : `${days} ${plural(days, DAYS)}`;
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  return `${minutes} мин`;
}

export type Countdown = { text: string; overdue: boolean };

/** Сколько осталось до `due` или на сколько он просрочен; точность — минута (округление вниз). */
export function countdown(due: Date, now: Date): Countdown {
  const diff = due.getTime() - now.getTime();
  if (diff === 0) return { text: "срок наступил", overdue: false };
  const minutes = Math.floor(Math.abs(diff) / MIN);
  if (diff > 0) {
    return { text: minutes === 0 ? "осталось меньше минуты" : `осталось ${span(minutes)}`, overdue: false };
  }
  return { text: minutes === 0 ? "просрочено меньше чем на минуту" : `просрочено на ${span(minutes)}`, overdue: true };
}

export type ShortCountdown = { label: "осталось" | "просрочено на"; value: string; text: string; overdue: boolean };

/**
 * Короткий таймер для очереди сотрудника: одна единица — минуты, часы (до двух суток), дальше дни.
 * «осталось 21 ч» / «просрочено на 2 ч»; меньше минуты округляем до «1 мин».
 */
export function shortCountdown(due: Date, now: Date): ShortCountdown {
  const diff = due.getTime() - now.getTime();
  const overdue = diff < 0;
  const minutes = Math.max(1, Math.floor(Math.abs(diff) / MIN));
  let value: string;
  if (minutes < 60) value = `${minutes} мин`;
  else if (minutes < 48 * 60) value = `${Math.floor(minutes / 60)} ч`;
  else {
    const days = Math.floor(minutes / (24 * 60));
    value = `${days} ${plural(days, DAYS)}`;
  }
  const label = overdue ? "просрочено на" : "осталось";
  return { label, value, text: `${label} ${value}`, overdue };
}
