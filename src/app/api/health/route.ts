import { sql } from "@/server/db/client";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

// Живость для Docker healthcheck и проверки после деплоя: только «да/нет», подробности ошибки наружу не отдаём.
export async function GET(): Promise<Response> {
  try {
    await sql`select 1`;
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
