import { CardsSkeleton, HeaderSkeleton } from "@/ui/PageSkeleton";
import { PublicPage } from "@/ui/PublicPage";

// Страница статическая и обычно открывается мгновенно; заготовка — на случай медленной сети.
export default function AboutLoading() {
  return (
    <PublicPage>
      <HeaderSkeleton />
      <CardsSkeleton count={2} lines={3} />
    </PublicPage>
  );
}
