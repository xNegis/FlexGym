import { Outlet } from "react-router-dom";
import brandLogo from "../../assets/logo.svg";
import styles from "./AuthLayout.module.css";

export default function AuthLayout() {
  return (
    <div className={styles.authLayout}>
      <div className={styles.brand}>
        <img className={styles.brandLogo} src={brandLogo} alt="" aria-hidden="true" />
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
