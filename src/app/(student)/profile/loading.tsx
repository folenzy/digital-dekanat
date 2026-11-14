import { HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Профиль грузится: имя и почта, строки настроек в рамке, данные списком.
export default function ProfileLoading() {
  return (
    <>
      <HeaderSkeleton subtitleLines={2} />
      <RowsSkeleton count={4} lines={1} framed />
      <SectionTitleSkeleton />
      <RowsSkeleton count={4} lines={2} />
    </>
  );
}
