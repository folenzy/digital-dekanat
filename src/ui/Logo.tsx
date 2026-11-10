import styles from "./Logo.module.css";

// Знак «На связи»: речевой пузырь (связь) — он же циферблат компаса, внутри стрелка на север («Ориентир»).
// Одноцветный (currentColor), читается от 16 px. Собственный рисунок, не эмблема вуза.

type LogoProps = {
  /** Размер знака в px. */
  size?: number;
  /** Надпись «На связи» рядом со знаком. */
  wordmark?: boolean;
  /** Подпись «цифровой деканат» под надписью. */
  subtitle?: boolean;
  className?: string;
};

export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
  return (
    <svg {...a11y} className={styles.mark} width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M12.19 25.16 4.5 28l1.34-9.19A11.5 11.5 0 1 1 12.19 25.16Z"
        stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"
      />
      <path d="M16.5 6.5 19.3 14.5h-5.6Z" fill="currentColor" />
      <path d="M13.7 14.5h5.6l-2.8 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 28, wordmark = true, subtitle = false, className }: LogoProps) {
  if (!wordmark) {
    return (
      <span className={[styles.logo, className].filter(Boolean).join(" ")}>
        <LogoMark size={size} title="На связи" />
      </span>
    );
  }
  return (
    <span className={[styles.logo, className].filter(Boolean).join(" ")}>
      <LogoMark size={size} />
      <span className={styles.text}>
        <span className={styles.word}>На связи</span>
        {/* пробел — чтобы в тексте ссылки было «На связи цифровой деканат», а не слитно */}
        {subtitle && " "}
        {subtitle && <span className={styles.sub}>цифровой деканат</span>}
      </span>
    </span>
  );
}
