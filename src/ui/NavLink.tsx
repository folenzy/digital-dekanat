"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { activeHref } from "./nav";

// Ссылка раздела: сама понимает, активна ли она (aria-current="page"), по текущему пути.
// hrefs — все разделы этой навигации: активным становится самый длинный совпавший префикс.

type NavLinkProps = { href: string; hrefs: readonly string[]; className?: string; children: ReactNode };

export function NavLink({ href, hrefs, className, children }: NavLinkProps) {
  const active = activeHref(usePathname(), hrefs) === href;
  return (
    <Link href={href} className={className} transitionTypes={["section"]} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
