import "server-only";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "./auth/cookie";
import { getSessionUser } from "./auth/session";
import { listenReady, subscribe } from "./realtime";

export const HEARTBEAT_MS = 25_000;

/**
 * SSE-поток событий текущего пользователя. Сессия берётся из cookie запроса, не из next/headers.
 * Нет сессии → 401. Каждые `heartbeatMs` шлёт комментарий-пинг и перепроверяет сессию:
 * если её нет (выход, ночной сброс), отправляет `session_end` и закрывает поток.
 */
export async function openEventStream(req: NextRequest, heartbeatMs: number = HEARTBEAT_MS): Promise<Response> {
  const token = req.cookies.get(SESSION_COOKIE.name)?.value;
  const session = token ? await getSessionUser(token, new Date()) : null;
  if (!token || !session) return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });

  // Проба сессии для клиента: без потока, только 204/401.
  if (req.nextUrl.searchParams.get("probe") === "1") {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  // Клиент мог отключиться, пока мы ждали БД: abort уже не придёт.
  if (req.signal.aborted) return new Response(null, { status: 499 });

  try {
    await listenReady();
    if (req.signal.aborted) return new Response(null, { status: 499 });
  } catch {
    return new Response("Service Unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  }

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(enc.encode(chunk));
      };
      const unsubscribe = subscribe(session.userId, (event) => send(`data: ${JSON.stringify(event)}\n\n`));
      let checking = false;
      const timer = setInterval(async () => {
        if (checking) return;
        checking = true;
        try {
          const alive = await getSessionUser(token, new Date());
          if (!alive) {
            send("event: session_end\ndata: {}\n\n");
            cleanup();
            controller.close();
            return;
          }
          send(": ping\n\n");
        } catch {
          send(": ping\n\n"); // БД моргнула — поток не рвём, проверим на следующем ударе
        } finally {
          checking = false;
        }
      }, heartbeatMs);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubscribe();
        req.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        try { controller.close(); } catch { /* уже закрыт */ }
      };
      req.signal.addEventListener("abort", onAbort);
      if (req.signal.aborted) {
        onAbort();
        return;
      }
      send(": connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
