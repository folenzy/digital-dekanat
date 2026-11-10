import { Skeleton } from "@/ui/Skeleton";
import { CardsSkeleton, HeaderSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// «Деканат» грузится: заголовок, лист «Спроси деканат», обращения.
export default function DekanatLoading() {
  return (
    <>
      <HeaderSkeleton />
      <Skeleton height="164px" radius="16px" />
      <SectionTitleSkeleton />
      <CardsSkeleton count={2} />
    </>
  );
}
