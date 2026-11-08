"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/ui/Button";
import { loginAction } from "./actions";
import styles from "./login.module.css";

// Форма входа: без JS тоже работает (обычная отправка формы), с JS — спиннер на кнопке и ошибка без перезагрузки.
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  // Логин — управляемое поле: React сбрасывает форму после действия, а логин после ошибки должен остаться.
  const [login, setLogin] = useState("");
  const [show, setShow] = useState(false);
  const password = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.error) password.current?.focus();
  }, [state]);

  return (
    <form action={action} className={styles.form} data-surface="paper">
      <div className={styles.field}>
        <label htmlFor="login" className={styles.label}>Логин</label>
        <input
          id="login"
          name="login"
          className={styles.input}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={64}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>Пароль</label>
        <div className={styles.passwordWrap}>
          <input
            ref={password}
            id="password"
            name="password"
            type={show ? "text" : "password"}
            className={styles.input}
            autoComplete="current-password"
            required
            maxLength={128}
            aria-describedby={state?.error ? "login-error" : undefined}
          />
          <button
            type="button"
            className={styles.reveal}
            aria-label={show ? "Скрыть пароль" : "Показать пароль"}
            aria-controls="password"
            onClick={() => setShow((s) => !s)}
          >
            {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      </div>

      {state?.error && (
        <p id="login-error" className={styles.error} role="alert">{state.error}</p>
      )}

      <Button type="submit" full loading={pending}>
        Войти
      </Button>
    </form>
  );
}
