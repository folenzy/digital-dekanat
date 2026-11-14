import { HeaderSkeleton, LineSkeleton, RowsSkeleton, TabsSkeleton } from "@/ui/PageSkeleton";

// «Учёба» грузится: сводка без рамки, вкладки, предметы — одна группа строк.
export default function StudyLoading() {
  return (
    <>
      <HeaderSkeleton />
      <LineSkeleton width="48%" />
      <LineSkeleton width="80%" />
      <TabsSkeleton />
      <RowsSkeleton count={4} lines={3} framed />
    </>
  );
}
