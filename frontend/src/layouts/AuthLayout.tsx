import { Outlet } from "react-router-dom";
import styles from "./AuthLayout.module.css";

export default function AuthLayout() {
  return (
    <div className={styles.authLayout}>
      <div className={styles.brand}>
        <h1 className={styles.brandWordmark}>FormCadence</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.card}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
