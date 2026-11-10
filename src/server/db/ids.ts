import { z } from "zod";

// Целочисленные ключи в БД — int4. Число больше уронило бы запрос в Postgres (22003 → 500),
// поэтому вход, который идёт в такие колонки, ограничиваем заранее и получаем обычную ошибку валидации.
export const PG_INT_MAX = 2_147_483_647;

/** Положительный id для колонки int4. */
export const dbId = z.number().int().positive().max(PG_INT_MAX);

export const isDbId = (n: unknown): n is number => dbId.safeParse(n).success;
