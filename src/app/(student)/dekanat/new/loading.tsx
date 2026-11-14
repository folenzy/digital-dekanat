import { HeaderSkeleton, RowsSkeleton } from "@/ui/PageSkeleton";

// Мастер обращения грузится: варианты — строки через линию.
export default function NewAppealLoading() {
  return (
    <>
      <HeaderSkeleton kicker />
      <RowsSkeleton count={3} lines={2} />
    </>
  );
}
