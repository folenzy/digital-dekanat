import { CardsSkeleton, HeaderSkeleton, StripSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// «Пары» грузятся: переключатель, полоса дней недели, пары (у пары рамка и на экране).
export default function ScheduleLoading() {
  return (
    <>
      <HeaderSkeleton subtitle={false} />
      <TabsSkeleton />
      <StripSkeleton />
      <CardsSkeleton count={3} lines={3} />
    </>
  );
}
