import { CardsSkeleton, HeaderSkeleton } from "@/ui/PageSkeleton";

// Профиль грузится: имя, должность, отделы.
export default function StaffProfileLoading() {
  return (
    <>
      <HeaderSkeleton />
      <CardsSkeleton count={1} lines={3} />
    </>
  );
}
