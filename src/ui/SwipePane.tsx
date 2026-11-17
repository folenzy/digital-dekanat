"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { commitDistance, dragOffset, isSwipeBlockedTarget, shouldCommit } from "./swipe";
import styles from "./SwipePane.module.css";

// Листание пальцем: лист идёт за пальцем, у края экрана появляется подсказка «куда попаду»,
// после порога (или быстрого смахивания) — переход на соседний экран. Что именно «соседнее», решает
// страница: она передаёт адреса и подписи (на «Парах» — соседний день или неделя). Стрелки и ссылки
// рядом остаются: жест — дополнение к нажатию, а не замена.
//
// Правила движения (скилл emil-design-eng):
// · сдвиг ставится прямо в style.transform элемента — без состояния React и CSS-переменных, без лишних пересчётов;
// · возврат и вход — CSS-переходы/WAAPI, их можно прервать новым жестом;
// · анимируется только переход, начатый жестом: нажатие на ссылку остаётся мгновенным;
// · при «уменьшить движение» лист не ездит, остаётся короткое проявление.

export type SwipeTarget = { href: string; label: string };

type Drag = {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  dragging: boolean;
  armed: boolean;
  /** Последний сдвиг пальца — на случай отмены жеста системой. */
  dx: number;
};

const EDGE_GUARD = 20; // у самого края экрана — системный жест «назад», его не перехватываем
const SLOP = 12; // сколько палец должен пройти, прежде чем жест считается горизонтальным

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type SwipePaneProps = {
  /** Куда ведёт движение пальца вправо (предыдущее) и влево (следующее); null — листать некуда. */
  prev: SwipeTarget | null;
  next: SwipeTarget | null;
  /** Меняется вместе с содержимым (дата, вид): по нему лист понимает, что пришёл новый экран. */
  pageKey: string;
  /** Неподвижная часть над листом (полоса дней): жест на ней начинается, но сама она не едет. */
  lead?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function SwipePane({ prev, next, pageKey, lead, className, children }: SwipePaneProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const hintPrev = useRef<HTMLDivElement>(null);
  const hintNext = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  /** С какой стороны войдёт следующий экран: ставит жест, читает эффект смены содержимого. */
  const pendingEnter = useRef<1 | -1 | null>(null);

  // Новое содержимое после свайпа входит с той стороны, откуда его «вытянули».
  useLayoutEffect(() => {
    const el = pane.current;
    window.clearTimeout(exitTimer.current);
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.style.transform = "";
    el.style.opacity = "";
    el.style.transition = "";
    document.documentElement.removeAttribute("data-swiping");
    const dir = pendingEnter.current;
    pendingEnter.current = null;
    if (dir === null || typeof el.animate !== "function") return;
    const reduced = prefersReducedMotion();
    el.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: `translateX(${dir * 22}%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }],
      { duration: reduced ? 140 : 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, [pageKey]);

  useEffect(() => () => {
    window.clearTimeout(exitTimer.current);
    document.documentElement.removeAttribute("data-swiping");
  }, []);

  function setHint(dx: number, armed: boolean) {
    const show = (el: HTMLDivElement | null, on: boolean) => {
      if (!el) return;
      const p = on ? Math.min(Math.abs(dx) / commitDistance(window.innerWidth), 1) : 0;
      el.style.opacity = String(p);
      el.style.transform = `translateY(-50%) scale(${0.9 + 0.1 * p})`;
      if (on && armed) el.setAttribute("data-armed", "");
      else el.removeAttribute("data-armed");
    };
    show(hintPrev.current, dx > 0 && !!prev);
    show(hintNext.current, dx < 0 && !!next);
  }

  function settle(el: HTMLDivElement) {
    // Возврат на место: переход можно прервать новым касанием
    el.style.transition = "transform 320ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease";
    el.style.transform = "translateX(0)";
    el.style.opacity = "";
    const done = () => {
      el.removeEventListener("transitionend", done);
      if (drag.current) return;
      el.style.transition = "";
      el.style.transform = "";
      document.documentElement.removeAttribute("data-swiping");
    };
    el.addEventListener("transitionend", done);
    window.setTimeout(done, 360);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || !e.isPrimary || drag.current) return;
    if (e.clientX < EDGE_GUARD || e.clientX > window.innerWidth - EDGE_GUARD) return;
    if (!root.current || isSwipeBlockedTarget(e.target as HTMLElement, root.current)) return;
    if (window.getSelection()?.toString()) return; // человек выделяет текст
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dragging: false, armed: false, dx: 0 };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = pane.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;

    if (!d.dragging) {
      if (Math.abs(dx) < SLOP) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.3) {
        drag.current = null; // это вертикальная прокрутка
        return;
      }
      d.dragging = true;
      try {
        root.current?.setPointerCapture(d.id); // палец может выйти за пределы листа — жест продолжается
      } catch {
        // указатель уже отпущен — не страшно, жест просто закончится
      }
      root.current?.setAttribute("data-dragging", "");
      document.documentElement.setAttribute("data-swiping", "");
      el.getAnimations().forEach((a) => a.cancel());
      el.style.transition = "none";
    }

    d.dx = dx;
    const hasNeighbor = dx > 0 ? !!prev : !!next;
    const offset = prefersReducedMotion() ? 0 : dragOffset(dx, hasNeighbor);
    el.style.transform = `translateX(${offset}px)`;
    if (hasNeighbor) el.style.opacity = String(1 - Math.min(Math.abs(dx) / window.innerWidth, 1) * 0.45);

    const armed = hasNeighbor && Math.abs(dx) >= commitDistance(window.innerWidth);
    if (armed && !d.armed) navigator.vibrate?.(8); // лёгкий отклик: «отпусти — и перейдёшь»
    d.armed = armed;
    setHint(dx, armed);
  }

  function finish(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    const el = pane.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    root.current?.removeAttribute("data-dragging");
    setHint(0, false);
    if (!d.dragging || !el) return;

    // после перетаскивания браузер может прислать click по тому, что было под пальцем, — гасим его
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 80);

    const dx = cancelled ? d.dx : e.clientX - d.x0;
    const target = dx > 0 ? prev : next;
    const go = !cancelled && target !== null && shouldCommit({ dx, dt: e.timeStamp - d.t0, width: window.innerWidth });
    if (!go || target === null) {
      settle(el);
      return;
    }

    const dir = dx < 0 ? 1 : -1; // влево → следующее входит справа
    pendingEnter.current = dir;
    if (!prefersReducedMotion()) {
      el.style.transition = "transform 180ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease";
      el.style.transform = `translateX(${-dir * 32}%)`;
    }
    el.style.opacity = "0";
    // как и ссылки рядом: страница не прыгает наверх, меняется только лист
    router.push(target.href, { scroll: false });
    // Страховка: если переход не состоялся (сеть), возвращаем лист на место
    exitTimer.current = window.setTimeout(() => {
      pendingEnter.current = null;
      settle(el);
    }, 2500);
  }

  return (
    <div
      ref={root}
      className={styles.root}
      data-swipe=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onClickCapture={(e) => {
        if (!suppressClick.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {lead}
      <div ref={pane} data-swipe-sheet="" className={[styles.pane, className].filter(Boolean).join(" ")}>
        {children}
      </div>
      {prev && (
        <div ref={hintPrev} className={styles.hint} data-side="prev" aria-hidden="true">
          <ChevronLeft className={styles.hintIcon} />
          {prev.label}
        </div>
      )}
      {next && (
        <div ref={hintNext} className={styles.hint} data-side="next" aria-hidden="true">
          {next.label}
          <ChevronRight className={styles.hintIcon} />
        </div>
      )}
    </div>
  );
}
