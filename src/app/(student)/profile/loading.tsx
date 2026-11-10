import { CardsSkeleton, HeaderSkeleton } from "@/ui/PageSkeleton";

// Профиль грузится: имя и два листа с данными.
export default function ProfileLoading() {
  return (
    <>
      <HeaderSkeleton />
      <CardsSkeleton count={2} lines={4} />
    </>
  );
}
