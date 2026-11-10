import { requireStaff } from "@/server/auth/viewer";
import { unreadCount } from "@/server/notifications";
import { getStaffProfile } from "@/server/profile";
import { AppShell } from "@/ui/AppShell";

// Оболочка кабинета сотрудника. Студенту — 404 (requireStaff). Layout не защищает server actions —
// каждая страница и каждое действие сами вызывают requireStaff().
export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const v = await requireStaff();
  const [profile, unread] = await Promise.all([getStaffProfile(v), unreadCount(v)]);
  const name = profile ? `${profile.firstName} ${profile.lastName}` : "Сотрудник деканата";
  return (
    <AppShell role="staff" userName={name} unread={unread}>
      {children}
    </AppShell>
  );
}
