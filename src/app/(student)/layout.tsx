import { requireStudent } from "@/server/auth/viewer";
import { unreadCount } from "@/server/notifications";
import { getProfile } from "@/server/profile";
import { AppShell } from "@/ui/AppShell";

// Оболочка кабинета студента. Layout не защищает server actions — каждая страница и действие
// сами вызывают requireStudent().
export default async function StudentLayout({ children }: LayoutProps<"/">) {
  const v = await requireStudent();
  const [profile, unread] = await Promise.all([getProfile(v), unreadCount(v)]);
  return (
    <AppShell role="student" userName={`${profile.firstName} ${profile.lastName}`} unread={unread}>
      {children}
    </AppShell>
  );
}
