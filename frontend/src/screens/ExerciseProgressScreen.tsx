import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Dumbbell } from "lucide-react";
import { fetchExerciseProgress, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { ExerciseProgressItem } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import SectionNav from "../ui/SectionNav";
import styles from "./Screen.module.css";

function formatLocalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ExerciseProgressScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [items, setItems] = useState<ExerciseProgressItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    try {
      const result = await fetchExerciseProgress();
      setItems(result);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load exercise progress. Please try again.");
    }
  }, [logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const showEmpty = items !== null && items.length === 0 && !error;

  return (
    <>
      <AppHeader title="Progress" />
      <Page width="reading">
        <p className={`${styles.textCompactMuted} ${styles.mb4}`}>
          Review how your recorded repetitions, weight, and estimated strength have changed over
          time.
        </p>

        <div className={styles.mb4}>
          <SectionNav
            label="Progress sections"
            items={[
              { value: "workouts", label: "Workouts", to: "/progress/workouts", active: false },
              { value: "exercises", label: "Exercises", to: "/progress/exercises", active: true },
            ]}
          />
        </div>

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

        {items === null && !error && <LoadingState label="Loading exercise progress..." />}

        {showEmpty && (
          <EmptyState
            icon={<Dumbbell size={32} />}
            title="No exercise progress yet"
            description="Exercises appear here after performed repetition sets are recorded in a completed or cancelled workout."
            action={
              <Button variant="primary" onClick={() => navigate("/today")}>
                Go to Today
              </Button>
            }
          />
        )}

        {items !== null && items.length > 0 && (
          <div className={styles.stack2}>
            {items.map((item) => (
              <Card
                key={item.exercise_slug}
                clickable
                onClick={() => navigate(`/progress/exercises/${item.exercise_slug}`)}
                className={styles.cardLink}
              >
                <div className={`${styles.stack2} ${styles.flex1}`}>
                  <div className={styles.cardTitle}>{item.exercise_name}</div>
                  <div className={styles.textCompactMuted}>
                    Last performed {formatLocalDate(item.last_local_date)} · {item.session_count}{" "}
                    {item.session_count === 1 ? "session" : "sessions"}
                  </div>
                </div>
                <ChevronRight size={16} aria-hidden="true" className={styles.chevron} />
              </Card>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
