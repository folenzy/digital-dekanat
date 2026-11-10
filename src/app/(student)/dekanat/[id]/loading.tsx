import { CardsSkeleton, HeaderSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Карточка обращения грузится: заголовок, срок, путь обращения, переписка.
export default function AppealLoading() {
  return (
    <>
      <HeaderSkeleton kicker />
      <CardsSkeleton count={1} lines={3} />
      <SectionTitleSkeleton />
      <CardsSkeleton count={1} lines={4} />
    </>
  );
}
