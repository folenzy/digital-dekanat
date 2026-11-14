import { CardsSkeleton, HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Обращение у сотрудника грузится: срок, данные студента и обращения списком, форма ответа.
export default function StaffAppealLoading() {
  return (
    <>
      <HeaderSkeleton kicker />
      <RowsSkeleton count={1} lines={3} />
      <SectionTitleSkeleton />
      <RowsSkeleton count={3} lines={1} />
      <SectionTitleSkeleton />
      <CardsSkeleton count={1} lines={3} />
    </>
  );
}
