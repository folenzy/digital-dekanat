import { CardsSkeleton, HeaderSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Карточка обращения грузится: заголовок, срок, студент, переписка.
export default function StaffAppealLoading() {
  return (
    <>
      <HeaderSkeleton kicker />
      <CardsSkeleton count={1} lines={3} />
      <SectionTitleSkeleton />
      <CardsSkeleton count={1} lines={4} />
    </>
  );
}
