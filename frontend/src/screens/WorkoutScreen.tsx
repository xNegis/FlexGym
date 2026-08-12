import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import { cancelWorkout, fetchWorkout, UnauthenticatedError, type WorkoutResult } from "../api";
import { useAuth } from "../context";
import type { WorkoutSession } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import Dialog from "../ui/Dialog";
import Section from "../ui/Section";
import styles from "./Screen.module.css";

function weekdayLabel(weekPosition: number): string {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days[weekPosition - 1] ?? "";
}

export default function WorkoutScreen() {
  const { workoutId: workoutIdParam } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discarding, setDiscarding] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const workoutId = Number(workoutIdParam);
  const isInvalidId = Number.isNaN(workoutId) || workoutId <= 0;

  const load = useCallback(async () => {
    if (isInvalidId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    setNotFound(false);
    try {
      const result: WorkoutResult = await fetchWorkout(workoutId);
      if ("notFound" in result) {
        setNotFound(true);
        setWorkout(null);
      } else {
        setWorkout(result);
      }
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load workout. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [workoutId, isInvalidId, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDiscard = async () => {
    if (!workout) return;
    setDiscarding(true);
    setDiscardError(null);
    try {
      const result = await cancelWorkout(workout.id);
      if ("notFound" in result) {
        setDiscardError("Workout is no longer available.");
        setDiscarding(false);
      } else if ("detail" in result) {
        setDiscardError(result.detail);
        setDiscarding(false);
      } else {
        navigate("/today", { replace: true });
      }
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setDiscardError("Unable to discard workout. Please try again.");
      setDiscarding(false);
    }
  };

  const isInProgress = workout?.status === "in_progress";
  const isCancelled = workout?.status === "cancelled";

  return (
    <>
      <AppHeader
        title={workout ? workout.selected_training_day_name : "Workout"}
        showBack
        onBack={() => navigate("/today")}
      />
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

        {loading && <LoadingState label="Loading workout..." />}

        {!loading && notFound && (
          <EmptyState
            icon={<CalendarCheck size={32} />}
            title="Workout not found"
            description="This workout is no longer available or you don't have access to it."
            action={
              <Button variant="primary" onClick={() => navigate("/today")}>
                Back to Today
              </Button>
            }
          />
        )}

        {!loading && !notFound && workout && (
          <div className={styles.stack5}>
            <Card>
              <div className={styles.stack3}>
                <div className={styles.rowBetween}>
                  {isInProgress ? (
                    <Badge variant="accent">In progress</Badge>
                  ) : (
                    <Badge variant="warning">Cancelled</Badge>
                  )}
                </div>
                <div>
                  <div className={styles.textCompactMuted}>{workout.routine_name}</div>
                  <div className={styles.textCompactMuted}>
                    {workout.local_date} —{" "}
                    {new Date(workout.started_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className={styles.textCompactMuted}>
                  {workout.selection_kind === "scheduled"
                    ? "Scheduled session"
                    : workout.scheduled_slot_was_rest
                      ? `Training on scheduled rest day (${weekdayLabel(workout.scheduled_week_position)})`
                      : workout.scheduled_training_day_name
                        ? `Chose ${workout.selected_training_day_name} instead of ${workout.scheduled_training_day_name}`
                        : "Alternate session"}
                </div>
              </div>
            </Card>

            <Section title="Exercises">
              <div className={styles.stack3}>
                {workout.exercises.map((ex) => (
                  <Card key={ex.position}>
                    <div className={styles.stack3}>
                      <div className={styles.rowBetween}>
                        <div>
                          <div className={styles.row2}>
                            <span className={styles.textCaptionSubtle}>{ex.position}.</span>
                            <span className={styles.cardTitle}>{ex.exercise_name}</span>
                          </div>
                          <div className={styles.textCompactMuted}>
                            {ex.planned_sets.length} {ex.planned_sets.length === 1 ? "set" : "sets"}{" "}
                            &middot;{" "}
                            {ex.target_type === "repetitions"
                              ? "Repetitions"
                              : ex.target_type === "duration_seconds"
                                ? "Duration"
                                : "Distance"}
                          </div>
                        </div>
                      </div>
                      <div className={styles.stack2}>
                        {ex.planned_sets.map((ps) => (
                          <div
                            key={ps.position}
                            className={`${styles.rowBetween} ${styles.rowWrap2}`}
                          >
                            <span className={styles.textCompactMuted}>Set {ps.position}</span>
                            <span>
                              {ex.target_type === "distance_meters"
                                ? `${ps.target_value} m`
                                : ex.target_type === "duration_seconds"
                                  ? `${ps.target_value}s`
                                  : `${ps.target_value}`}
                              {ps.target_weight_kg != null && ` @ ${ps.target_weight_kg} kg`}
                              {ps.target_rir != null && ` — RIR ${ps.target_rir}`}
                              {ps.tempo != null &&
                                ` · Tempo ${ps.tempo.eccentric_seconds}-${ps.tempo.stretched_pause_seconds}-${ps.tempo.concentric_seconds}-${ps.tempo.peak_contraction_seconds}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Section>

            {isInProgress && (
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setDiscardError(null);
                  setDiscardOpen(true);
                }}
              >
                Discard workout
              </Button>
            )}

            {isCancelled && (
              <Button variant="primary" fullWidth onClick={() => navigate("/today")}>
                Back to Today
              </Button>
            )}
          </div>
        )}
      </Page>

      {isInProgress && (
        <Dialog
          open={discardOpen}
          title="Discard workout"
          onClose={() => {
            if (!discarding) {
              setDiscardError(null);
              setDiscardOpen(false);
            }
          }}
          actions={
            <div className={styles.row2}>
              <Button
                variant="secondary"
                onClick={() => {
                  setDiscardError(null);
                  setDiscardOpen(false);
                }}
                disabled={discarding}
              >
                Keep workout
              </Button>
              <Button variant="danger" onClick={handleDiscard} disabled={discarding}>
                {discarding ? "Discarding..." : "Discard workout"}
              </Button>
            </div>
          }
        >
          <div className={styles.stack3}>
            <p>
              Are you sure you want to discard{" "}
              <strong>{workout?.selected_training_day_name}</strong>?
            </p>
            <p className={styles.textCompactMuted}>
              This will record the workout as cancelled and it cannot be resumed. The workout data
              will be retained.
            </p>
            {discardError && <Alert variant="error">{discardError}</Alert>}
          </div>
        </Dialog>
      )}
    </>
  );
}
