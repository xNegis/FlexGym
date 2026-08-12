import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarCheck, Check, Info, Play, SkipForward } from "lucide-react";
import {
  cancelWorkout,
  completeWorkout,
  fetchWorkout,
  startExercise,
  UnauthenticatedError,
  type WorkoutResult,
} from "../api";
import { useAuth, useWorkoutNav } from "../context";
import type { WorkoutExerciseSnapshot, WorkoutPlannedSetSnapshot, WorkoutSession } from "../types";
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

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return "Less than 1 min";
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
  if (hours > 0) return `${hours} hr`;
  return `${minutes} min`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function setValueLabel(targetType: string, value: number): string {
  if (targetType === "repetitions") return `${value}`;
  if (targetType === "duration_seconds") return `${value}s`;
  return `${value} m`;
}

function setResultSummary(ex: WorkoutExerciseSnapshot, ps: WorkoutPlannedSetSnapshot): string {
  if (ps.performance) {
    const parts = [setValueLabel(ex.target_type, ps.performance.performed_value)];
    if (ps.performance.performed_weight_kg != null)
      parts.push(`@ ${ps.performance.performed_weight_kg} kg`);
    if (ps.performance.performed_rir != null) parts.push(`RIR ${ps.performance.performed_rir}`);
    if (ps.performance.entry_mode === "adjusted") parts.push("adjusted");
    return parts.join(" · ");
  }
  const parts = [setValueLabel(ex.target_type, ps.target_value)];
  if (ps.target_weight_kg != null) parts.push(`@ ${ps.target_weight_kg} kg`);
  if (ps.target_rir != null) parts.push(`RIR ${ps.target_rir}`);
  if (ps.tempo != null)
    parts.push(
      `Tempo ${ps.tempo.eccentric_seconds}-${ps.tempo.stretched_pause_seconds}-${ps.tempo.concentric_seconds}-${ps.tempo.peak_contraction_seconds}`,
    );
  return parts.join(" · ");
}

function selectionContext(workout: WorkoutSession): string {
  if (workout.selection_kind === "scheduled") return "Scheduled session";
  if (workout.scheduled_slot_was_rest)
    return `Training on scheduled rest day (${weekdayLabel(workout.scheduled_week_position)})`;
  if (workout.scheduled_training_day_name)
    return `Chose ${workout.selected_training_day_name} instead of ${workout.scheduled_training_day_name}`;
  return "Alternate session";
}

export default function WorkoutScreen() {
  const { workoutId: workoutIdParam } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { setWorkoutNavStatus } = useWorkoutNav();

  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discarding, setDiscarding] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [startingExercise, setStartingExercise] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const completedSummaryRef = useRef<HTMLDivElement | null>(null);

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

  const refresh = useCallback(async (): Promise<WorkoutSession | null> => {
    if (isInvalidId) return null;
    try {
      const result: WorkoutResult = await fetchWorkout(workoutId);
      if ("notFound" in result) {
        setNotFound(true);
        setWorkout(null);
        return null;
      }
      setWorkout(result);
      return result;
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
      }
      return null;
    }
  }, [workoutId, isInvalidId, logout]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (workout?.status === "in_progress") {
      setWorkoutNavStatus("in_progress");
    } else if (workout?.status === "completed" || workout?.status === "cancelled") {
      setWorkoutNavStatus("terminal");
    } else {
      setWorkoutNavStatus(null);
    }
    return () => setWorkoutNavStatus(null);
  }, [workout, setWorkoutNavStatus]);

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

  const handleFinish = async () => {
    if (!workout) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const result = await completeWorkout(workout.id);
      if ("notFound" in result) {
        setNotFound(true);
        setWorkout(null);
        setFinishOpen(false);
        setFinishing(false);
        return;
      }
      if ("detail" in result) {
        const refreshed = await refresh();
        setFinishing(false);
        if (refreshed && refreshed.status === "completed") {
          setFinishOpen(false);
          setFinishError(null);
          requestAnimationFrame(() => completedSummaryRef.current?.focus());
        } else {
          setFinishError(result.detail);
        }
        return;
      }
      setWorkout(result);
      setFinishOpen(false);
      setFinishError(null);
      setFinishing(false);
      requestAnimationFrame(() => completedSummaryRef.current?.focus());
    } catch {
      setFinishError("Unable to finish workout. Please try again.");
      setFinishing(false);
    }
  };

  const isInProgress = workout?.status === "in_progress";
  const isCancelled = workout?.status === "cancelled";
  const isCompleted = workout?.status === "completed";
  const isTerminal = isCompleted || isCancelled;
  const noExerciseStarted =
    workout?.all_sets_resolved === false &&
    workout?.completed_set_count === 0 &&
    workout?.skipped_set_count === 0 &&
    workout?.current_exercise_position == null &&
    workout?.transition_to_exercise_position == null;
  const firstExercise = workout?.exercises[0];
  const canResume = isInProgress && !noExerciseStarted;
  const unresolvedSetCount = workout
    ? Math.max(0, workout.total_set_count - workout.completed_set_count - workout.skipped_set_count)
    : 0;

  const handleStartFirstExercise = async () => {
    if (!workout || !firstExercise) return;
    setStartingExercise(true);
    setExecutionError(null);
    try {
      const result = await startExercise(workout.id, firstExercise.position);
      if ("notFound" in result) {
        setExecutionError("Workout is no longer available.");
        return;
      }
      if ("detail" in result) {
        setExecutionError(result.detail);
        return;
      }
      navigate(`/workouts/${workout.id}/exercises/${firstExercise.position}`);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setExecutionError("Unable to start exercise. Please try again.");
    } finally {
      setStartingExercise(false);
    }
  };

  return (
    <>
      <AppHeader
        title={workout ? workout.selected_training_day_name : "Workout"}
        showBack
        onBack={() => navigate(isTerminal ? "/history" : "/today")}
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

        {!loading && !notFound && workout && isCompleted && (
          <div className={styles.stack5} ref={completedSummaryRef} tabIndex={-1}>
            <Card>
              <div className={styles.stack3}>
                <div className={styles.row2}>
                  <Badge variant="success">Completed</Badge>
                </div>
                <div>
                  <div className={styles.textCompactMuted}>{workout.routine_name}</div>
                  <div className={styles.cardTitle}>{workout.selected_training_day_name}</div>
                  <div className={styles.textCompactMuted}>{workout.local_date}</div>
                </div>
                <div className={styles.stack2}>
                  <div className={styles.rowBetween}>
                    <span className={styles.textCompactMuted}>Started</span>
                    <span>{formatTime(workout.started_at)}</span>
                  </div>
                  {workout.completed_at && (
                    <div className={styles.rowBetween}>
                      <span className={styles.textCompactMuted}>Completed</span>
                      <span>{formatTime(workout.completed_at)}</span>
                    </div>
                  )}
                  <div className={styles.rowBetween}>
                    <span className={styles.textCompactMuted}>Workout duration</span>
                    <span>
                      {workout.duration_seconds != null
                        ? formatDuration(workout.duration_seconds)
                        : ""}
                    </span>
                  </div>
                  <div className={styles.rowBetween}>
                    <span className={styles.textCompactMuted}>Sets</span>
                    <span>
                      {workout.completed_set_count} performed · {workout.skipped_set_count} skipped
                      · {workout.total_set_count} total
                    </span>
                  </div>
                  <div className={styles.textCompactMuted}>{selectionContext(workout)}</div>
                </div>
                <Button
                  variant="primary"
                  fullWidth
                  className={styles.actionButton}
                  onClick={() => navigate("/history")}
                >
                  Back to History
                </Button>
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
                            {ex.total_set_count} {ex.total_set_count === 1 ? "set" : "sets"} ·{" "}
                            {ex.target_type === "repetitions"
                              ? "Repetitions"
                              : ex.target_type === "duration_seconds"
                                ? "Duration"
                                : "Distance"}
                          </div>
                        </div>
                        {ex.execution_status === "completed" && (
                          <Badge variant="success">Done</Badge>
                        )}
                        {ex.execution_status === "partial" && (
                          <Badge variant="accent">Partial</Badge>
                        )}
                        {ex.execution_status === "skipped" && (
                          <Badge variant="warning">Skipped</Badge>
                        )}
                      </div>
                      <div className={styles.stack2}>
                        {ex.planned_sets.map((ps) => (
                          <div
                            key={ps.position}
                            className={`${styles.rowBetween} ${styles.rowWrap2}`}
                          >
                            <span className={styles.textCompactMuted}>Set {ps.position}</span>
                            {ps.exception ? (
                              <div className={styles.row1}>
                                <SkipForward size={12} className={styles.textCaptionMuted} />
                                <span className={styles.textCaptionMuted}>
                                  Skipped
                                  {ps.exception.scope === "exercise" ? " (exercise)" : ""}
                                </span>
                              </div>
                            ) : ps.performance ? (
                              <span className={styles.textCompactMuted}>
                                <Check size={12} className={styles.setCheck} aria-hidden="true" />
                                {setResultSummary(ex, ps)}
                              </span>
                            ) : (
                              <span className={styles.textCompactMuted}>
                                {setResultSummary(ex, ps)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          </div>
        )}

        {!loading && !notFound && workout && isCancelled && (
          <div className={styles.stack5}>
            <Card>
              <div className={styles.stack3}>
                <div className={styles.row2}>
                  <Badge variant="warning">Cancelled</Badge>
                </div>
                <div>
                  <div className={styles.textCompactMuted}>{workout.routine_name}</div>
                  <div className={styles.cardTitle}>{workout.selected_training_day_name}</div>
                  <div className={styles.textCompactMuted}>{workout.local_date}</div>
                </div>
                <div className={styles.stack2}>
                  <div className={styles.rowBetween}>
                    <span className={styles.textCompactMuted}>Started</span>
                    <span>{formatTime(workout.started_at)}</span>
                  </div>
                  {workout.cancelled_at && (
                    <div className={styles.rowBetween}>
                      <span className={styles.textCompactMuted}>Cancelled</span>
                      <span>{formatTime(workout.cancelled_at)}</span>
                    </div>
                  )}
                  <div className={styles.rowBetween}>
                    <span className={styles.textCompactMuted}>Workout duration</span>
                    <span>
                      {workout.duration_seconds != null
                        ? formatDuration(workout.duration_seconds)
                        : ""}
                    </span>
                  </div>
                  <div className={styles.rowBetween}>
                    <span className={styles.textCompactMuted}>Sets</span>
                    <span>
                      {workout.completed_set_count} performed · {workout.skipped_set_count} skipped
                      {unresolvedSetCount > 0 && ` · ${unresolvedSetCount} not done`} ·{" "}
                      {workout.total_set_count} total
                    </span>
                  </div>
                  <div className={styles.textCompactMuted}>{selectionContext(workout)}</div>
                </div>
                <Button
                  variant="primary"
                  fullWidth
                  className={styles.actionButton}
                  onClick={() => navigate("/history")}
                >
                  Back to History
                </Button>
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
                            {ex.total_set_count} {ex.total_set_count === 1 ? "set" : "sets"} ·{" "}
                            {ex.target_type === "repetitions"
                              ? "Repetitions"
                              : ex.target_type === "duration_seconds"
                                ? "Duration"
                                : "Distance"}
                          </div>
                        </div>
                        {ex.execution_status === "completed" && (
                          <Badge variant="success">Done</Badge>
                        )}
                        {ex.execution_status === "partial" && (
                          <Badge variant="accent">Partial</Badge>
                        )}
                        {ex.execution_status === "skipped" && (
                          <Badge variant="warning">Skipped</Badge>
                        )}
                        {ex.execution_status === "in_progress" && (
                          <Badge variant="accent">In progress</Badge>
                        )}
                        {ex.execution_status === "pending" && (
                          <Badge variant="default">Not started</Badge>
                        )}
                      </div>
                      <div className={styles.stack2}>
                        {ex.planned_sets.map((ps) => (
                          <div
                            key={ps.position}
                            className={`${styles.rowBetween} ${styles.rowWrap2}`}
                          >
                            <span className={styles.textCompactMuted}>Set {ps.position}</span>
                            {ps.exception ? (
                              <div className={styles.row1}>
                                <SkipForward size={12} className={styles.textCaptionMuted} />
                                <span className={styles.textCaptionMuted}>
                                  Skipped
                                  {ps.exception.scope === "exercise" ? " (exercise)" : ""}
                                </span>
                              </div>
                            ) : ps.performance ? (
                              <span className={styles.textCompactMuted}>
                                <Check size={12} className={styles.setCheck} aria-hidden="true" />
                                {setResultSummary(ex, ps)}
                              </span>
                            ) : (
                              <span className={styles.textCaptionMuted}>Not done</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          </div>
        )}

        {!loading && !notFound && workout && isInProgress && (
          <div className={styles.stack5}>
            <Card>
              <div className={styles.stack3}>
                <div className={styles.row2}>
                  <Badge variant="accent">In progress</Badge>
                  {workout.all_sets_recorded && <Badge variant="success">All sets recorded</Badge>}
                  {workout.all_sets_resolved && !workout.all_sets_recorded && (
                    <Badge variant="accent">All sets resolved</Badge>
                  )}
                </div>
                <div>
                  <div className={styles.textCompactMuted}>{workout.routine_name}</div>
                  <div className={styles.textCompactMuted}>
                    {workout.local_date} — {formatTime(workout.started_at)}
                  </div>
                </div>
                <div className={styles.textCompactMuted}>
                  {workout.completed_set_count} completed
                  {workout.skipped_set_count > 0 &&
                    ` · ${workout.skipped_set_count} skipped`} of {workout.total_set_count} sets
                </div>
                <div className={styles.textCompactMuted}>{selectionContext(workout)}</div>
                {executionError && <Alert variant="error">{executionError}</Alert>}
                {noExerciseStarted && firstExercise && (
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={handleStartFirstExercise}
                    disabled={startingExercise}
                  >
                    {startingExercise ? "Starting…" : "Start first exercise"}
                  </Button>
                )}
                {canResume && !workout.all_sets_resolved && workout.resume_url && (
                  <Button variant="primary" fullWidth onClick={() => navigate(workout.resume_url!)}>
                    Resume workout
                  </Button>
                )}
                {workout.all_sets_resolved && (
                  <Button
                    variant="primary"
                    fullWidth
                    className={styles.actionButton}
                    onClick={() => {
                      setFinishError(null);
                      setFinishOpen(true);
                    }}
                  >
                    Finish workout
                  </Button>
                )}
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
                        <div className={styles.row1}>
                          {(ex.completed_set_count > 0 || ex.skipped_set_count > 0) && (
                            <Badge variant="accent">
                              {ex.completed_set_count}/{ex.total_set_count}
                            </Badge>
                          )}
                          {ex.is_complete && ex.execution_status === "completed" && (
                            <Badge variant="success">Done</Badge>
                          )}
                          {ex.execution_status === "partial" && (
                            <Badge variant="accent">Partial</Badge>
                          )}
                          {ex.execution_status === "skipped" && (
                            <Badge variant="warning">Skipped</Badge>
                          )}
                          {ex.instructions && (
                            <Info
                              size={14}
                              className={styles.textCaptionSubtle}
                              aria-label="Instructions available"
                            />
                          )}
                          {ex.started_at != null && (
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() =>
                                navigate(`/workouts/${workout.id}/exercises/${ex.position}`)
                              }
                            >
                              <Play size={14} aria-hidden="true" />
                              <span>{ex.is_complete ? "View" : "Resume"}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className={styles.stack2}>
                        {ex.planned_sets.map((ps) => (
                          <div
                            key={ps.position}
                            className={`${styles.rowBetween} ${styles.rowWrap2}`}
                          >
                            <span className={styles.textCompactMuted}>Set {ps.position}</span>
                            {ps.exception ? (
                              <div className={styles.row1}>
                                <SkipForward size={12} className={styles.textCaptionMuted} />
                                <span className={styles.textCaptionMuted}>
                                  Skipped
                                  {ps.exception.scope === "exercise" ? " (exercise)" : ""}
                                </span>
                              </div>
                            ) : (
                              <span className={styles.textCompactMuted}>
                                {setResultSummary(ex, ps)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Section>

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

      {isInProgress && workout?.all_sets_resolved && (
        <Dialog
          open={finishOpen}
          title="Finish workout"
          onClose={() => {
            if (!finishing) {
              setFinishError(null);
              setFinishOpen(false);
            }
          }}
          actions={
            <div className={styles.row2}>
              <Button
                variant="secondary"
                onClick={() => {
                  setFinishError(null);
                  setFinishOpen(false);
                }}
                disabled={finishing}
              >
                Keep workout open
              </Button>
              <Button variant="primary" onClick={handleFinish} disabled={finishing}>
                {finishing ? "Finishing…" : "Finish workout"}
              </Button>
            </div>
          }
        >
          <div className={styles.stack3}>
            <p>
              Finish <strong>{workout?.selected_training_day_name}</strong>?
            </p>
            <p className={styles.textCompactMuted}>
              {workout?.completed_set_count} performed
              {workout && workout.skipped_set_count > 0
                ? ` · ${workout.skipped_set_count} skipped`
                : ""}{" "}
              of {workout?.total_set_count} sets.
            </p>
            <p className={styles.textCompactMuted}>
              Finishing makes this workout read-only. You'll still be able to review its summary.
            </p>
            {finishError && <Alert variant="error">{finishError}</Alert>}
          </div>
        </Dialog>
      )}
    </>
  );
}
