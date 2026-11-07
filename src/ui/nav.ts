// Разделы оболочки (спека §7). Только данные и чистые функции: годятся и для сервера, и для клиента.

export type ShellRole = "student" | "staff";
export type NavIcon = "today" | "schedule" | "study" | "dekanat" | "profile" | "queue" | "announcements";
export type NavItem = { href: string; label: string; icon: NavIcon };

const STUDENT: NavItem[] = [
  { href: "/", label: "Сегодня", icon: "today" },
  { href: "/schedule", label: "Пары", icon: "schedule" },
  { href: "/study", label: "Учёба", icon: "study" },
  { href: "/dekanat", label: "Деканат", icon: "dekanat" },
  { href: "/profile", label: "Профиль", icon: "profile" },
];

const STAFF: NavItem[] = [
  { href: "/staff", label: "Очередь", icon: "queue" },
  { href: "/staff/announcements", label: "Объявления", icon: "announcements" },
  { href: "/staff/profile", label: "Профиль", icon: "profile" },
];

export function navItems(role: ShellRole): NavItem[] {
  return role === "student" ? STUDENT : STAFF;
}

/** Куда ведёт колокольчик: студенту — уведомления, сотруднику — очередь обращений. */
export function bellHref(role: ShellRole): string {
  return role === "student" ? "/notifications" : "/staff";
}

function matches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Активный раздел: самый длинный совпавший префикс («/staff/announcements» важнее «/staff»); «/» — только точно. */
export function activeHref(pathname: string | null, hrefs: readonly string[]): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    if (matches(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
