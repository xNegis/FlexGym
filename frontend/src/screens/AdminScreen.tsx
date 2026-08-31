import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context";
import {
  fetchAdminOverview,
  ForbiddenError,
  UnauthenticatedError,
  type AdminOverview,
} from "../api";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import { KeyValueList } from "../ui/Section";
import { StaticCard } from "../ui/Card";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import styles from "./Screen.module.css";

export default function AdminScreen() {
  const { clearProfile } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchAdminOverview();
      setOverview(result);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        clearProfile();
        navigate("/login", { replace: true });
        return;
      }
      if (err instanceof ForbiddenError) {
        setOverview(null);
        navigate("/profile", { replace: true });
        return;
      }
      setOverview(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [clearProfile, navigate]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <>
      <AppHeader title="Administration" showBack onBack={() => navigate("/profile")} />

      <Page width="reading">
        <p className={styles.textBodyMuted}>
          This area contains system-level information for this installation.
        </p>

        <div className={styles.mt4}>
          {loading ? (
            <LoadingState label="Loading administration overview..." />
          ) : error ? (
            <div className={styles.stack2}>
              <Alert variant="error">Unable to load administration overview.</Alert>
              <Button variant="secondary" size="small" onClick={() => void loadOverview()}>
                Retry
              </Button>
            </div>
          ) : (
            <StaticCard>
              <KeyValueList
                items={[
                  {
                    label: "Registered users",
                    value: String(overview?.registered_user_count ?? 0),
                  },
                ]}
              />
            </StaticCard>
          )}
        </div>
      </Page>
    </>
  );
}
