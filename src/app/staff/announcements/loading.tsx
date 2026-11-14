import { CardsSkeleton, HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Объявления грузятся: форма (у формы рамка и на экране), опубликованные — строками.
export default function StaffAnnouncementsLoading() {
  return (
    <>
      <HeaderSkeleton />
      <CardsSkeleton count={1} lines={5} />
      <SectionTitleSkeleton />
      <RowsSkeleton count={2} lines={3} />
    </>
  );
}
