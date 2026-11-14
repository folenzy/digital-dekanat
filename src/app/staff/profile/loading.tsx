import { HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Профиль сотрудника грузится: имя и должность, строки настроек, отделы.
export default function StaffProfileLoading() {
  return (
    <>
      <HeaderSkeleton />
      <RowsSkeleton count={2} lines={1} framed />
      <SectionTitleSkeleton />
      <RowsSkeleton count={3} lines={1} />
    </>
  );
}
