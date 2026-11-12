// Свайп между разделами нижней навигации — чистая логика жеста (без React и DOM-событий), её проверяют тесты.
// Сам компонент — SwipeNav.tsx.

/** Порог по расстоянию: 28% ширины экрана, но не больше 110 px (на планшете не нужно тянуть через пол-экрана). */
const DISTANCE_RATIO = 0.28;
const DISTANCE_MAX = 110;
/** Быстрое смахивание засчитывается и на коротком пути. */
const FLICK_VELOCITY = 0.45; // px/мс
const FLICK_MIN_DISTANCE = 36;
/** Сопротивление, когда соседа нет: лист тянется, но всё неохотнее. */
const RUBBER_LIMIT = 56;

export type SwipeNeighbors = { prev: string | null; next: string | null };

/**
 * Соседние разделы для текущего пути. Свайп работает только на самих разделах («/», «/schedule», …):
 * на вложенных страницах (карточка обращения, мастер, уведомления) — null, чтобы жест не увёл с формы.
 */
export function swipeNeighbors(pathname: string | null, hrefs: readonly string[]): SwipeNeighbors | null {
  if (!pathname) return null;
  const i = hrefs.indexOf(pathname);
  if (i === -1) return null;
  return { prev: hrefs[i - 1] ?? null, next: hrefs[i + 1] ?? null };
}

/** Сдвиг листа под пальцем: с соседом — один к одному, без соседа — с нарастающим сопротивлением. */
export function dragOffset(dx: number, hasNeighbor: boolean): number {
  if (hasNeighbor) return dx;
  const d = Math.abs(dx);
  const eased = RUBBER_LIMIT * (1 - Math.exp(-d / 180));
  return Math.sign(dx) * eased;
}

/** Порог перехода по расстоянию для экрана такой ширины. */
export function commitDistance(width: number): number {
  return Math.min(width * DISTANCE_RATIO, DISTANCE_MAX);
}

/** Переходить ли после отпускания: дотянули до порога или быстро смахнули. */
export function shouldCommit({ dx, dt, width }: { dx: number; dt: number; width: number }): boolean {
  const d = Math.abs(dx);
  if (d >= commitDistance(width)) return true;
  const velocity = d / Math.max(dt, 1);
  return d >= FLICK_MIN_DISTANCE && velocity >= FLICK_VELOCITY;
}

type Walkable = {
  tagName: string;
  parentElement: Walkable | null;
  isContentEditable: boolean;
  scrollWidth: number;
  clientWidth: number;
  hasAttribute(name: string): boolean;
};

const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Жест не начинаем там, где у пальца другая работа: в полях ввода (курсор, выделение),
 * в том, что само листается вбок (полоса дней), и внутри [data-no-swipe].
 */
export function isSwipeBlockedTarget(target: Walkable | null, root: Walkable): boolean {
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (FIELD_TAGS.has(el.tagName) || el.isContentEditable) return true;
    if (el.hasAttribute("data-no-swipe")) return true;
    if (el.scrollWidth > el.clientWidth + 4) return true;
  }
  return false;
}
