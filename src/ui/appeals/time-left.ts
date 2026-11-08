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
