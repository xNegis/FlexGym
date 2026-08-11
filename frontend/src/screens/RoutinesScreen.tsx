import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchRoutines, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { Routine } from "../types";
import { labelFor } from "../components/routineConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import { ChevronRight, ClipboardList } from "lucide-react";
import styles from "./Screen.module.css";

export default function RoutinesScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchRoutines();
      setRoutines(data);
    } catch (requestError) {
      if (requestError instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load routines. Please try again.");
    }
  }, [logout]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <AppHeader title="Routines" />
      <Page width="reading">
        {error && (
          <div className={styles.mb4}>
            <Alert variant="error">
              <div className={styles.stack2}>
                <span>{error}</span>
                <Button variant="secondary" size="small" onClick={load}>
                  Retry
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {routines === null && !error && <LoadingState label="Loading routines..." />}

        {routines !== null && !error && routines.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={32} />}
            title="No routines yet"
            description="Create your first training routine to get started."
            action={
              <Button variant="primary" onClick={() => navigate("/plan/routines/new")}>
                Create routine
              </Button>
            }
          />
        )}

        {routines !== null && !error && routines.length > 0 && (
          <>
            <div className={styles.mb4}>
              <Button variant="primary" onClick={() => navigate("/plan/routines/new")} fullWidth>
                Create routine
              </Button>
            </div>

            {!routines.some((routine) => routine.is_active) && (
              <Alert variant="info">
                No routine is currently selected as your active training plan.
              </Alert>
            )}

            <div className={styles.stack3}>
              {routines.map((routine) => (
                <Card
                  key={routine.id}
                  clickable
                  active={routine.is_active}
                  onClick={() => navigate(`/plan/routines/${routine.id}`)}
                  className={styles.cardRow}
                >
                  <div className={styles.rowBetweenStart}>
                    <div className={styles.flex1}>
                      <div className={`${styles.cardTitle} ${styles.mb1}`}>{routine.name}</div>
                      <div className={`${styles.textCompactMuted} ${styles.mb2}`}>
                        {labelFor(routine.objective)}
                        {routine.description &&
                          ` \u00B7 ${routine.description.slice(0, 60)}${routine.description.length > 60 ? "..." : ""}`}
                      </div>
                      <div className={styles.row2}>
                        <Badge variant={routine.is_active ? "accent" : "default"}>
                          {routine.training_day_count}{" "}
                          {routine.training_day_count === 1 ? "session" : "sessions"}
                        </Badge>
                        {routine.is_active && <Badge variant="success">Active</Badge>}
                      </div>
                    </div>
                    <ChevronRight size={16} aria-hidden="true" className={styles.chevronTop} />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </Page>
    </>
  );
}
