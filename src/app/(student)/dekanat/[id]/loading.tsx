import { CardsSkeleton, HeaderSkeleton, RowsSkeleton, SectionTitleSkeleton } from "@/ui/PageSkeleton";

// Обращение грузится: срок между линиями, данные списком, форма сообщения (у формы рамка и на экране).
export default function AppealLoading() {
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
