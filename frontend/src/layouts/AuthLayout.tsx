import { Outlet } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import styles from "./AuthLayout.module.css";

export default function AuthLayout() {
  return (
    <div className={styles.authLayout}>
      <div className={styles.brand}>
        <div className={styles.brandIcon} aria-hidden="true">
          <Dumbbell size={24} />
        </div>
        <h1 className={styles.brandWordmark}>FlexGym</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.card}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
