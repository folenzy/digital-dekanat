"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { commitDistance, dragOffset, isSwipeBlockedTarget, shouldCommit, swipeNeighbors } from "./swipe";
import styles from "./SwipeNav.module.css";

// Свайп между разделами на телефоне: лист идёт за пальцем, у края экрана появляется подсказка «куда попаду»,
// после порога (или быстрого смахивания) — переход на соседний раздел. Нижняя панель остаётся: жест — дополнение
// к нажатию, а не замена.
//
// Правила движения (скилл emil-design-eng):
// · сдвиг ставится прямо в style.transform элемента — без состояния React и CSS-переменных, без лишних пересчётов;
// · возврат и вход — CSS-переходы/WAAPI, их можно прервать новым жестом;
// · анимируется только переход, начатый жестом: нажатие на вкладку остаётся мгновенным;
// · при «уменьшить движение» лист не ездит, остаётся короткое проявление.

type Item = { href: string; label: string };

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

export function SwipeNav({ items, className, children }: { items: Item[]; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const hintPrev = useRef<HTMLDivElement>(null);
  const hintNext = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  /** С какой стороны войдёт следующий экран: ставит жест, читает эффект смены пути. */
  const pendingEnter = useRef<1 | -1 | null>(null);

  const hrefs = items.map((i) => i.href);
  const neighbors = swipeNeighbors(pathname, hrefs);
  const label = (href: string | null) => items.find((i) => i.href === href)?.label ?? "";

  // Новый раздел после свайпа входит с той стороны, откуда его «вытянули».
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
    // лист уже въезжает целиком — каскад блоков внутри него не нужен
    el.setAttribute("data-swipe-enter", "");
    const enter = el.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: `translateX(${dir * 22}%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }],
      { duration: reduced ? 140 : 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    const clear = () => el.removeAttribute("data-swipe-enter");
    enter.addEventListener("finish", clear);
    enter.addEventListener("cancel", clear);
  }, [pathname]);

  useEffect(() => {
    // Каскад появления блоков — только при первом открытии кабинета (см. today.module.css)
    const entered = window.setTimeout(() => document.documentElement.setAttribute("data-entered", ""), 900);
    return () => {
      window.clearTimeout(entered);
      window.clearTimeout(exitTimer.current);
    };
  }, []);

  function setHint(dx: number, armed: boolean) {
    const prev = hintPrev.current;
    const next = hintNext.current;
    const show = (el: HTMLDivElement | null, on: boolean) => {
      if (!el) return;
      const p = on ? Math.min(Math.abs(dx) / commitDistance(window.innerWidth), 1) : 0;
      el.style.opacity = String(p);
      el.style.transform = `translateY(-50%) scale(${0.9 + 0.1 * p})`;
      if (on && armed) el.setAttribute("data-armed", "");
      else el.removeAttribute("data-armed");
    };
    show(prev, dx > 0 && !!neighbors?.prev);
    show(next, dx < 0 && !!neighbors?.next);
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
    if (!neighbors || e.pointerType !== "touch" || !e.isPrimary || drag.current) return;
    if (e.clientX < EDGE_GUARD || e.clientX > window.innerWidth - EDGE_GUARD) return;
    if (!root.current || isSwipeBlockedTarget(e.target as HTMLElement, root.current)) return;
    if (window.getSelection()?.toString()) return; // человек выделяет текст
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dragging: false, armed: false, dx: 0 };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = pane.current;
    if (!d || !el || !neighbors || e.pointerId !== d.id) return;
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
    const hasNeighbor = dx > 0 ? !!neighbors.prev : !!neighbors.next;
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
    if (!d.dragging || !el || !neighbors) return;

    // после перетаскивания браузер может прислать click по тому, что было под пальцем, — гасим его
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 80);

    const dx = cancelled ? d.dx : e.clientX - d.x0;
    const target = dx > 0 ? neighbors.prev : neighbors.next;
    const go = !cancelled && target !== null && shouldCommit({ dx, dt: e.timeStamp - d.t0, width: window.innerWidth });
    if (!go || target === null) {
      settle(el);
      return;
    }

    const dir = dx < 0 ? 1 : -1; // влево → следующий раздел входит справа
    pendingEnter.current = dir;
    if (!prefersReducedMotion()) {
      el.style.transition = "transform 180ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease";
      el.style.transform = `translateX(${-dir * 32}%)`;
    }
    el.style.opacity = "0";
    router.push(target);
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
      data-swipe={neighbors ? "" : undefined}
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
      <div ref={pane} className={[styles.pane, className].filter(Boolean).join(" ")}>
        {children}
      </div>
      {neighbors?.prev && (
        <div ref={hintPrev} className={styles.hint} data-side="prev" aria-hidden="true">
          <ChevronLeft className={styles.hintIcon} />
          {label(neighbors.prev)}
        </div>
      )}
      {neighbors?.next && (
        <div ref={hintNext} className={styles.hint} data-side="next" aria-hidden="true">
          {label(neighbors.next)}
          <ChevronRight className={styles.hintIcon} />
        </div>
      )}
    </div>
  );
}
