import { CardsSkeleton, HeaderSkeleton } from "@/ui/PageSkeleton";

// Мастер обращения грузится: шаги и варианты.
export default function NewAppealLoading() {
  return (
    <>
      <HeaderSkeleton kicker />
      <CardsSkeleton count={3} lines={1} />
    </>
  );
}
