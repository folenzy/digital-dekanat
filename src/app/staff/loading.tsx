import { CardsSkeleton, HeaderSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// Очередь грузится: заголовок, сводка, вкладки, талоны.
export default function QueueLoading() {
  return (
    <>
      <HeaderSkeleton kicker subtitle={false} />
      <CardsSkeleton count={1} lines={2} spaced />
      <TabsSkeleton />
      <CardsSkeleton count={3} lines={3} />
    </>
  );
}
