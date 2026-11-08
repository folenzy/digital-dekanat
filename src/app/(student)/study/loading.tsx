import { CardsSkeleton, HeaderSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// «Учёба» грузится: сводка «Как у меня дела», вкладки, дисциплины.
export default function StudyLoading() {
  return (
    <>
      <HeaderSkeleton />
      <CardsSkeleton count={1} lines={3} spaced />
      <TabsSkeleton />
      <CardsSkeleton count={3} lines={3} />
    </>
  );
}
