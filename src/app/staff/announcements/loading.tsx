import { CardsSkeleton, HeaderSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Объявления грузятся: заголовок, форма, лента.
export default function StaffAnnouncementsLoading() {
  return (
    <>
      <HeaderSkeleton />
      <CardsSkeleton count={1} lines={5} />
      <SectionTitleSkeleton />
      <CardsSkeleton count={2} lines={3} />
    </>
  );
}
