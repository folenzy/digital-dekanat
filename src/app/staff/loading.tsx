import { HeaderSkeleton, LineSkeleton, RowsSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// Очередь грузится: строка сводки, вкладки, таблица обращений в рамке.
export default function QueueLoading() {
  return (
    <>
      <HeaderSkeleton subtitle={false} />
      <LineSkeleton width="70%" />
      <TabsSkeleton />
      <RowsSkeleton count={6} lines={2} framed />
    </>
  );
}
