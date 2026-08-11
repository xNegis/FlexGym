import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context";
import Button from "../ui/Button";
import styles from "./Screen.module.css";

export default function UnavailableScreen() {
  const { retry, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated") navigate("/login", { replace: true });
    if (status === "onboarding") navigate("/onboarding", { replace: true });
    if (status === "authenticated") navigate("/plan", { replace: true });
  }, [navigate, status]);

  return (
    <div className={`${styles.stack5} ${styles.centered}`}>
      <div>
        <h2 className={styles.screenTitle}>Unable to reach the server</h2>
        <p className={styles.textBodyMuted}>Please ensure the backend is running and try again.</p>
      </div>
      <div className={styles.centeredRow}>
        <Button variant="primary" onClick={retry}>
          Retry
        </Button>
        <Button variant="secondary" onClick={() => navigate("/login")}>
          Back to login
        </Button>
      </div>
    </div>
  );
}
