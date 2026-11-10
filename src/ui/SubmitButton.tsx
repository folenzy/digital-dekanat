"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "./Button";

// Кнопка отправки формы с серверным действием: пока действие идёт — спиннер и блокировка (против двойного тапа).

type SubmitButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: ReactNode;
  full?: boolean;
  className?: string;
};

export function SubmitButton({ children, variant = "secondary", icon, full, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} icon={icon} full={full} loading={pending} className={className}>
      {children}
    </Button>
  );
}
