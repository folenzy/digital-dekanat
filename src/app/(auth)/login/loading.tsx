import { ConceptBanner } from "@/ui/ConceptBanner";
import { SkeletonCard } from "@/ui/Skeleton";
import styles from "./login.module.css";

// Пока открывается страница входа — пометка концепта и заготовка формы.
export default function LoginLoading() {
  return (
    <div className={styles.page}>
      <ConceptBanner />
      <div className={styles.main}>
        <div className={styles.panel}>
          <SkeletonCard lines={4} />
        </div>
      </div>
    </div>
  );
}
