import type { ReactNode } from "react";
import { PageTransition } from "@/ui/PageTransition";

// Шаблон пересоздаётся при переходе между разделами: содержимое растворяется, шапка и панели стоят на месте.
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
