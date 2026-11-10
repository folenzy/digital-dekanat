import { Bell as BellIcon, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Toast.module.css";

// Тост о событии в реальном времени: тёмный лист поверх экрана. ToastRegion — постоянная live-область,
// чтобы скринридер объявлял появившийся тост; сам Toast — только оформление (показ и таймер — в LiveEvents).

export function ToastRegion({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {children}
    </div>
  );
}

type ToastProps = {
  title: string;
  /** Относительная ссылка на этот же сайт (проверена вызывающим, см. isSafeHref). */
  href?: string;
  onClose?: () => void;
};

export function Toast({ title, href, onClose }: ToastProps) {
  return (
    <div className={styles.toast} data-surface="ink">
      <span className={styles.icon} aria-hidden="true"><BellIcon /></span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {href && (
          <Link href={href} className={styles.link} onClick={onClose}>
            Открыть
          </Link>
        )}
      </div>
      {onClose && (
        <button type="button" className={styles.close} aria-label="Скрыть уведомление" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
