import { CardsSkeleton, HeaderSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// Уведомления грузятся: вкладки и список.
export default function NotificationsLoading() {
  return (
    <>
      <HeaderSkeleton subtitle={false} />
      <TabsSkeleton />
      <CardsSkeleton count={4} lines={1} />
    </>
  );
}
