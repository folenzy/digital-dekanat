import { BookOpen, CalendarDays, Inbox, Megaphone, MessagesSquare, Sun, UserRound, type LucideIcon } from "lucide-react";
import type { NavIcon } from "./nav";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  today: Sun,
  schedule: CalendarDays,
  study: BookOpen,
  dekanat: MessagesSquare,
  profile: UserRound,
  queue: Inbox,
  announcements: Megaphone,
};
