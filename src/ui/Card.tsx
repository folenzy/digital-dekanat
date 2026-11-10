import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Card.module.css";

// Карточка-лист. paper — обычная; ink — тёмная «важное» (не больше одной на экран); accent — терракотовая рамка
// («нужно твоё действие»). С href вся карточка — ссылка: не клади внутрь другие ссылки и кнопки.

export type CardVariant = "paper" | "ink" | "accent";

type CardProps = {
  variant?: CardVariant;
  as?: "section" | "article" | "div" | "li";
  href?: string;
  /** Короткая строка над заголовком: что это за карточка («Следующая пара», «Обращение»). */
  kicker?: ReactNode;
  title?: ReactNode;
  titleAs?: "h2" | "h3" | "p";
  children?: ReactNode;
  className?: string;
};

export function Card({
  variant = "paper", as: Tag = "section", href, kicker, title, titleAs: Title = "h3", children, className,
}: CardProps) {
  const cls = [styles.card, styles[variant], href && styles.link, className].filter(Boolean).join(" ");
  const surface = variant === "ink" ? "ink" : "paper";
  const content = (
    <>
      {kicker && <p className={styles.kicker}>{kicker}</p>}
      {title && <Title className={styles.title}>{title}</Title>}
      {children && (kicker || title ? <div className={styles.body}>{children}</div> : children)}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} data-surface={surface}>
        {content}
      </Link>
    );
  }
  return (
    <Tag className={cls} data-surface={surface}>
      {content}
    </Tag>
  );
}
