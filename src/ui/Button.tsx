import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Button.module.css";

// Кнопка: primary — главное действие экрана (одно), secondary — остальные, ghost — третьестепенные.
// Цвета берутся из поверхности (data-surface): в тёмной карточке primary сам становится светло-терракотовым.
// loading — блокирует повторное нажатие (двойной тап на телефоне) и показывает спиннер.

export type ButtonVariant = "primary" | "secondary" | "ghost";

type Common = {
  variant?: ButtonVariant;
  /** Иконка слева (lucide, 18 px). */
  icon?: ReactNode;
  /** На всю ширину контейнера. */
  full?: boolean;
  children: ReactNode;
  className?: string;
};

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
  href?: undefined;
  loading?: boolean;
  /** React 19: ref — обычный проп; нужен, чтобы перевести фокус на кнопку (подтверждение «Отклонить»). */
  ref?: Ref<HTMLButtonElement>;
};

type AsLink = Common & { href: string; "aria-label"?: string };

export type ButtonProps = AsButton | AsLink;

function classes(variant: ButtonVariant, full: boolean | undefined, className: string | undefined) {
  return [styles.btn, styles[variant], full && styles.full, className].filter(Boolean).join(" ");
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { href, variant = "primary", icon, full, children, className, ...rest } = props;
    return (
      <Link href={href} className={classes(variant, full, className)} data-variant={variant} {...rest}>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
        <span>{children}</span>
      </Link>
    );
  }
  const {
    variant = "primary", icon, full, children, className, loading = false, disabled, type = "button", ...rest
  } = props;
  return (
    <button
      type={type}
      className={classes(variant, full, className)}
      data-variant={variant}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={styles.icon} aria-hidden="true"><LoaderCircle className={styles.spinner} /></span>
      ) : (
        icon && <span className={styles.icon} aria-hidden="true">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
}
