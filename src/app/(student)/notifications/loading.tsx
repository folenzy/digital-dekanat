import { HeaderSkeleton, RowsSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// Уведомления грузятся: вкладки, фильтр, список строками.
export default function NotificationsLoading() {
  return (
    <>
      <HeaderSkeleton subtitle={false} />
      <TabsSkeleton />
      <TabsSkeleton small />
      <RowsSkeleton count={5} lines={2} />
    </>
  );
}
