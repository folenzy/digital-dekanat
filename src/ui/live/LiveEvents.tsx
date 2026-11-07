"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toast, ToastRegion } from "../Toast";

// Событие, как его присылает /api/events и как оно приходит в window-событие `ns:live` (detail).
export type LiveEventDetail = {
  type: "notification" | "appeal_updated" | "announcement";
  title?: string;
  href?: string;
  appealId?: string;
};

const TOAST_MS = 6000;
const RECONNECT_MS = 3000;
const TYPES = ["notification", "appeal_updated", "announcement"];

/** Только относительные ссылки на этот же сайт: "/x", но не "//host" и не "/\host". */
export function isSafeHref(href: unknown): href is string {
  // Без пробелов и управляющих символов: парсер URL вырезает tab/CR/LF, и "/<tab>/host" стал бы "//host".
  if (typeof href !== "string" || !/^\/(?![\/\x5c])[^\x00-\x20\x7f]*$/.test(href)) return false;
  if (typeof location === "undefined") return true;
  try {
    return new URL(href, location.origin).origin === location.origin;
  } catch {
    return false;
  }
}

/** Разбор сообщения SSE: неизвестная форма → null; небезопасный href отбрасывается. */
export function parseLiveEvent(raw: string): LiveEventDetail | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.type !== "string" || !TYPES.includes(o.type)) return null;
  const out: LiveEventDetail = { type: o.type as LiveEventDetail["type"] };
  if (typeof o.title === "string") out.title = o.title;
  if (isSafeHref(o.href)) out.href = o.href;
  if (typeof o.appealId === "string") out.appealId = o.appealId;
  return out;
}

const expire = () => {
  // Полная перезагрузка нужна намеренно: сбросить клиентское состояние сессии.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login?reason=expired");
};

/**
 * Подключается к /api/events: тост, событие `ns:live` для колокольчика и router.refresh().
 * Монтируется в AppShell; оформление тоста — src/ui/Toast.tsx.
 */
export function LiveEvents() {
  const router = useRouter();
  // seq — ключ тоста: новое событие заново проигрывает появление, даже если тост ещё виден.
  const [toast, setToast] = useState<{ detail: LiveEventDetail; seq: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const es = new EventSource("/api/events");
      source = es;
      es.onmessage = (e: MessageEvent<string>) => {
        const detail = parseLiveEvent(e.data);
        if (!detail) return;
        setToast((prev) => ({ detail, seq: (prev?.seq ?? 0) + 1 }));
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setToast(null), TOAST_MS);
        window.dispatchEvent(new CustomEvent<LiveEventDetail>("ns:live", { detail }));
        router.refresh();
      };
      es.addEventListener("session_end", () => {
        es.close();
        expire();
      });
      // Браузер сам переподключается, пока readyState CONNECTING. CLOSED — он сдался (например, 401 после сброса).
      es.onerror = async () => {
        if (stopped || es.readyState !== EventSource.CLOSED) return;
        try {
          const r = await fetch("/api/events?probe=1", { cache: "no-store" });
          if (stopped) return;
          if (r.status === 401) return expire();
        } catch {
          /* сеть недоступна — попробуем позже */
        }
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();

    return () => {
      stopped = true;
      source?.close();
      clearTimeout(retry);
      clearTimeout(hideTimer.current);
    };
  }, [router]);

  const close = () => {
    clearTimeout(hideTimer.current);
    setToast(null);
  };

  return (
    <ToastRegion>
      {toast && (
        <Toast
          key={toast.seq}
          title={toast.detail.title ?? "Новое уведомление"}
          href={isSafeHref(toast.detail.href) ? toast.detail.href : undefined}
          onClose={close}
        />
      )}
    </ToastRegion>
  );
}
