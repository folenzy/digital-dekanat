import { HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// «Сегодня» грузится: день и что сейчас, лента пар с колонкой времени, обращения, сроки.
export default function TodayLoading() {
  return (
    <>
      <HeaderSkeleton subtitleLines={2} />
      <SectionTitleSkeleton />
      <RowsSkeleton count={3} lines={2} time />
      <SectionTitleSkeleton />
      <RowsSkeleton count={1} lines={2} />
      <SectionTitleSkeleton />
      <RowsSkeleton count={2} lines={2} />
    </>
  );
}
