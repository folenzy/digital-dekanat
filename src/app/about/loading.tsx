import { HeaderSkeleton, RowsSkeleton } from "@/ui/PageSkeleton";
import { PublicPage } from "@/ui/PublicPage";

// Страница статическая и обычно открывается мгновенно; заготовка — на случай медленной сети.
export default function AboutLoading() {
  return (
    <PublicPage>
      <HeaderSkeleton />
      <RowsSkeleton count={4} lines={2} />
    </PublicPage>
  );
}
