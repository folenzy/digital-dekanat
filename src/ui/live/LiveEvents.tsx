"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Событие, как его присылает /api/events и как оно приходит в window-событие `ns:live` (detail).
export type LiveEventDetail = {
  type: "notification" | "appeal_updated" | "announcement";
  title?: string;
  href?: string;
  appealId?: string;
};

const TOAST_MS = 6000;

/**
 * Подключается к /api/events: тост, событие `ns:live` для колокольчика и router.refresh().
 * Минимальный вид; оформление — в оболочке приложения.
 */
export function LiveEvents() {
  const router = useRouter();
  const [toast, setToast] = useState<LiveEventDetail | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (e: MessageEvent<string>) => {
      let detail: LiveEventDetail;
      try {
        detail = JSON.parse(e.data) as LiveEventDetail;
      } catch {
        return;
      }
      setToast(detail);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setToast(null), TOAST_MS);
      window.dispatchEvent(new CustomEvent<LiveEventDetail>("ns:live", { detail }));
      router.refresh();
    };
    source.addEventListener("session_end", () => {
      source.close();
      // Полная перезагрузка нужна намеренно: сбросить клиентское состояние сессии.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?reason=expired");
    });
    return () => {
      source.close();
      clearTimeout(hideTimer.current);
    };
  }, [router]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: "fixed", right: 16, bottom: 16, zIndex: 50, maxWidth: "min(24rem, calc(100vw - 32px))" }}
    >
      {toast && (
        <div style={{ background: "#1f2933", color: "#fff", padding: "12px 16px", borderRadius: 8 }}>
          <p style={{ margin: 0 }}>{toast.title ?? "Новое уведомление"}</p>
          {toast.href && (
            <Link href={toast.href} style={{ color: "#fff", textDecoration: "underline" }} onClick={() => setToast(null)}>
              Открыть
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
