import { CardsSkeleton, HeaderSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// «Сегодня» грузится: приветствие, карточка деканата, пары, обращения.
export default function TodayLoading() {
  return (
    <>
      <HeaderSkeleton kicker />
      <CardsSkeleton count={1} lines={3} />
      <SectionTitleSkeleton />
      <CardsSkeleton count={2} />
      <SectionTitleSkeleton />
      <CardsSkeleton count={1} />
    </>
  );
}
