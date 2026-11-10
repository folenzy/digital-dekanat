"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Строка-кнопка уведомления: пока действие идёт — помечена занятой и не нажимается повторно.
export function ItemButton({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      {children}
    </button>
  );
}
