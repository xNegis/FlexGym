import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Clock3, ClockAlert, Edit3, Info, SkipForward, Undo2, X } from "lucide-react";
import {
  fetchWorkout,
  markSetIncomplete,
  recordSetPerformance,
  skipExercise,
  skipSet,
  startExercise,
  startSet,
  undoSkipExercise,
  undoSkipSet,
  UnauthenticatedError,
  updateSetPerformance,
  type SetPerformanceResult,
  type SkipBody,
  type SkipResult,
  type WorkoutResult,
} from "../api";
import { useAuth, useWorkoutNav } from "../context";
import type {
  PerformedSet,
  WorkoutExerciseSnapshot,
  WorkoutPlannedSetSnapshot,
  WorkoutSession,
} from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import Dialog from "../ui/Dialog";
import { Field, Select, TextArea, TextInput } from "../ui/Field";
import styles from "./Screen.module.css";

const SKIP_REASON_LABELS: Record<string, string> = {
  not_enough_time: "Not enough time",
  too_fatigued: "Too fatigued",
  equipment_unavailable: "Equipment unavailable",
  unable_to_perform: "Unable to perform",
  pain_or_discomfort: "Pain or discomfort",
  other: "Other",
};

const SKIP_REASON_CODES = Object.keys(SKIP_REASON_LABELS);

function targetLabel(targetType: string, value: number): string {
  if (targetType === "repetitions") return `${value}`;
  if (targetType === "duration_seconds") return `${value}s`;
  return `${value} m`;
}

function performedLabel(targetType: string, perf: PerformedSet): string {
  if (targetType === "repetitions") return `${perf.performed_value}`;
  if (targetType === "duration_seconds") return `${perf.performed_value}s`;
  return `${perf.performed_value} m`;
}

function performedSetSummary(perf: PerformedSet): string {
  const parts = [`${perf.performed_value}`];
  if (perf.performed_weight_kg != null) parts.push(`@ ${perf.performed_weight_kg} kg`);
  if (perf.performed_rir != null) parts.push(`RIR ${perf.performed_rir}`);
  parts.push(perf.entry_mode === "adjusted" ? "adj" : "planned");
  return parts.join(" · ");
}

function formatTimer(seconds: number, overtime: boolean): string {
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const prefix = overtime ? "+" : "";
  return `${prefix}${m}:${String(s).padStart(2, "0")}`;
}

function computeSetRestTimer(
  exercise: WorkoutExerciseSnapshot | undefined,
  currentSet: WorkoutPlannedSetSnapshot | null | undefined,
  serverNow: string,
  clientReceivedAt: number,
): { seconds: number; overtime: boolean } | null {
  if (!exercise || !currentSet) return null;
  const serverTime = new Date(serverNow).getTime();
  const estimatedServerNow = serverTime + (Date.now() - clientReceivedAt);
  const previousSet = exercise.planned_sets[currentSet.position - 2];
  if (!previousSet?.performance || previousSet.rest_after_set_seconds == null) return null;

  const target =
    new Date(previousSet.performance.completed_at).getTime() +
    previousSet.rest_after_set_seconds * 1000;
  const remaining = Math.ceil((target - estimatedServerNow) / 1000);
  if (remaining > 0) return { seconds: remaining, overtime: false };
  return {
    seconds: Math.max(0, Math.floor((estimatedServerNow - target) / 1000)),
    overtime: true,
  };
}

function computeTransitionTimer(
  exercise: WorkoutExerciseSnapshot | undefined,
  serverNow: string,
  nextExercise: WorkoutExerciseSnapshot | undefined,
  clientReceivedAt: number,
): { seconds: number; overtime: boolean } | null {
  if (!exercise || !exercise.is_resolved || !nextExercise) return null;
  const serverTime = new Date(serverNow).getTime();
  const estimatedServerNow = serverTime + (Date.now() - clientReceivedAt);

  const completedAt = exercise.latest_completed_at;
  if (!completedAt) return null;
  const elapsed = Math.max(
    0,
    Math.floor((estimatedServerNow - new Date(completedAt).getTime()) / 1000),
  );
  const threshold = exercise.rest_after_exercise_seconds;
  return { seconds: elapsed, overtime: threshold != null && elapsed >= threshold };
}

export default function WorkoutExecutionScreen() {
  const { workoutId: workoutIdParam, exercisePosition: exercisePosParam } = useParams<{
    workoutId: string;
    exercisePosition: string;
  }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { setWorkoutNavStatus } = useWorkoutNav();

  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [adjustSet, setAdjustSet] = useState<WorkoutPlannedSetSnapshot | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustWeight, setAdjustWeight] = useState("");
  const [adjustRir, setAdjustRir] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [transitionStarting, setTransitionStarting] = useState(false);
  const [timerTick, setTimerTick] = useState(0);
  const [serverReceivedAt, setServerReceivedAt] = useState(() => Date.now());
  const [adjustDraft, setAdjustDraft] = useState<{
    performed_value: string;
    performed_weight_kg: string;
    performed_rir: string;
  } | null>(null);

  const [skipDialogOpen, setSkipDialogOpen] = useState<"set" | "exercise" | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [skipNote, setSkipNote] = useState("");
  const [skipError, setSkipError] = useState<string | null>(null);
  const [skipPending, setSkipPending] = useState(false);
  const [undoPending, setUndoPending] = useState<{ setPos?: number; exercise?: boolean } | null>(
    null,
  );

  const workoutId = Number(workoutIdParam);
  const exercisePosition = Number(exercisePosParam);
  const isInvalidId =
    Number.isNaN(workoutId) ||
    workoutId <= 0 ||
    Number.isNaN(exercisePosition) ||
    exercisePosition < 1;

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
        setServerReceivedAt(Date.now());
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

  useEffect(() => {
    if (!workout) return;
    const interval = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [workout]);

  const applyWorkout = useCallback((updated: WorkoutSession) => {
    setWorkout(updated);
    setServerReceivedAt(Date.now());
    setSaving(false);
    setSaveError(null);
    setAdjustSet(null);
    setAdjustError(null);
    setAdjusting(false);
    setStarting(false);
    setTransitionStarting(false);
    setAdjustDraft(null);
    setSkipDialogOpen(null);
    setSkipReason("");
    setSkipNote("");
    setSkipError(null);
    setSkipPending(false);
    setUndoPending(null);
  }, []);

  const handleApiError = useCallback(
    (err: unknown, action: string) => {
      if (err instanceof UnauthenticatedError) {
        logout();
        return true;
      }
      setSaveError(`Unable to ${action}. Please try again.`);
      setSaving(false);
      setAdjusting(false);
      setStarting(false);
      setTransitionStarting(false);
      setSkipPending(false);
      return true;
    },
    [logout],
  );

  const exercise = useMemo(
    () => workout?.exercises.find((e) => e.position === exercisePosition),
    [workout, exercisePosition],
  );

  const nextExercise = useMemo(
    () => workout?.exercises.find((e) => e.position === exercisePosition + 1) ?? null,
    [workout, exercisePosition],
  );

  const currentSet = useMemo(() => {
    if (!exercise) return null;
    for (const s of exercise.planned_sets) {
      if (s.performance == null && s.exception == null) return s;
    }
    return null;
  }, [exercise]);

  const handleStartExercise = useCallback(async () => {
    if (!workout) return;
    setStarting(true);
    setSaveError(null);
    try {
      const result = await startExercise(workout.id, exercisePosition);
      if ("notFound" in result) {
        setNotFound(true);
        setStarting(false);
        return;
      }
      if ("detail" in result) {
        setSaveError(result.detail);
        setStarting(false);
        return;
      }
      applyWorkout(result);
    } catch (err) {
      handleApiError(err, "start exercise");
    }
  }, [workout, exercisePosition, applyWorkout, handleApiError]);

  const handleStartSet = useCallback(async () => {
    if (!workout || !currentSet) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await startSet(workout.id, exercisePosition, currentSet.position);
      if ("notFound" in result) {
        setNotFound(true);
        setSaving(false);
        return;
      }
      if ("detail" in result) {
        setSaveError(result.detail);
        setSaving(false);
        return;
      }
      applyWorkout(result);
    } catch (err) {
      handleApiError(err, "start set");
    }
  }, [workout, exercisePosition, currentSet, applyWorkout, handleApiError]);

  const handleRecordSet = useCallback(
    async (setPosition: number) => {
      if (!workout) return;
      setSaving(true);
      setSaveError(null);
      try {
        const entryMode = adjustDraft ? "adjusted" : "as_planned";
        let result: SetPerformanceResult;
        if (entryMode === "as_planned") {
          result = await recordSetPerformance(workout.id, exercisePosition, setPosition, {
            entry_mode: "as_planned",
          });
        } else {
          const value = Number(adjustDraft!.performed_value);
          const weight = adjustDraft!.performed_weight_kg.trim()
            ? Number(adjustDraft!.performed_weight_kg)
            : null;
          const rir = adjustDraft!.performed_rir.trim() ? Number(adjustDraft!.performed_rir) : null;
          result = await recordSetPerformance(workout.id, exercisePosition, setPosition, {
            entry_mode: "adjusted",
            performed_value: value,
            performed_weight_kg: weight,
            performed_rir: rir,
          });
        }
        if ("notFound" in result) {
          setNotFound(true);
          setSaving(false);
          return;
        }
        if ("detail" in result) {
          setSaveError(result.detail);
          setSaving(false);
          return;
        }
        applyWorkout(result);
      } catch (err) {
        handleApiError(err, "save set");
      }
    },
    [workout, exercisePosition, adjustDraft, applyWorkout, handleApiError],
  );

  const handleUpdateSet = useCallback(
    async (setPosition: number) => {
      if (!workout) return;
      setAdjusting(true);
      setAdjustError(null);
      try {
        const value = Number(adjustValue);
        const weight = adjustWeight.trim() ? Number(adjustWeight) : null;
        const rir = adjustRir.trim() ? Number(adjustRir) : null;
        const result = await updateSetPerformance(
          workout.id,
          exercisePosition,
          setPosition,
          value,
          weight,
          rir,
        );
        if ("notFound" in result) {
          setNotFound(true);
          setAdjusting(false);
          return;
        }
        if ("detail" in result) {
          setAdjustError(result.detail);
          setAdjusting(false);
          return;
        }
        applyWorkout(result);
      } catch (err) {
        handleApiError(err, "update set");
      }
    },
    [workout, exercisePosition, adjustValue, adjustWeight, adjustRir, applyWorkout, handleApiError],
  );

  const handleApplyAdjustments = useCallback(() => {
    if (!adjustSet) return;
    setAdjustDraft({
      performed_value: adjustValue,
      performed_weight_kg: adjustWeight,
      performed_rir: adjustRir,
    });
    setAdjustSet(null);
    setAdjustError(null);
  }, [adjustSet, adjustValue, adjustWeight, adjustRir]);

  const handleMarkIncomplete = useCallback(
    async (setPosition: number) => {
      if (!workout) return;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await markSetIncomplete(workout.id, exercisePosition, setPosition);
        if ("notFound" in result) {
          setNotFound(true);
          setSaving(false);
          return;
        }
        if ("detail" in result) {
          setSaveError(result.detail);
          setSaving(false);
          return;
        }
        applyWorkout(result);
      } catch (err) {
        handleApiError(err, "mark incomplete");
      }
    },
    [workout, exercisePosition, applyWorkout, handleApiError],
  );

  const handleSkipConfirm = useCallback(async () => {
    if (!workout || !skipDialogOpen) return;
    setSkipPending(true);
    setSkipError(null);
    try {
      const body: SkipBody = {};
      if (skipReason) body.reason_code = skipReason;
      if (skipNote.trim()) body.note = skipNote.trim();

      let result: SkipResult;
      if (skipDialogOpen === "set" && currentSet) {
        result = await skipSet(workout.id, exercisePosition, currentSet.position, body);
      } else {
        result = await skipExercise(workout.id, exercisePosition, body);
      }
      if ("notFound" in result) {
        setNotFound(true);
        setSkipPending(false);
        return;
      }
      if ("detail" in result) {
        setSkipError(result.detail);
        setSkipPending(false);
        return;
      }
      applyWorkout(result);
    } catch (err) {
      handleApiError(err, "skip");
    }
  }, [
    workout,
    skipDialogOpen,
    skipReason,
    skipNote,
    currentSet,
    exercisePosition,
    applyWorkout,
    handleApiError,
  ]);

  const handleUndoSetSkip = useCallback(
    async (setPosition: number) => {
      if (!workout) return;
      setUndoPending({ setPos: setPosition });
      try {
        const result = await undoSkipSet(workout.id, exercisePosition, setPosition);
        if ("notFound" in result) {
          setNotFound(true);
          setUndoPending(null);
          return;
        }
        if ("detail" in result) {
          setSaveError(result.detail);
          setUndoPending(null);
          return;
        }
        applyWorkout(result);
      } catch (err) {
        handleApiError(err, "undo skip");
      }
    },
    [workout, exercisePosition, applyWorkout, handleApiError],
  );

  const handleUndoExerciseSkip = useCallback(async () => {
    if (!workout || !exercise) return;
    setUndoPending({ exercise: true });
    try {
      const result = await undoSkipExercise(workout.id, exercisePosition);
      if ("notFound" in result) {
        setNotFound(true);
        setUndoPending(null);
        return;
      }
      if ("detail" in result) {
        setSaveError(result.detail);
        setUndoPending(null);
        return;
      }
      applyWorkout(result);
    } catch (err) {
      handleApiError(err, "undo skip");
    }
  }, [workout, exercisePosition, exercise, applyWorkout, handleApiError]);

  const openSkipDialog = (scope: "set" | "exercise") => {
    setSkipDialogOpen(scope);
    setSkipReason("");
    setSkipNote("");
    setSkipError(null);
  };

  const closeSkipDialog = () => {
    if (!skipPending) {
      setSkipError(null);
      setSkipDialogOpen(null);
    }
  };

  const setPhase = workout?.current_set_phase ?? null;
  const isAwaitingStart = setPhase === "awaiting_set_start";
  const isSetInProgress = setPhase === "set_in_progress";

  const isExerciseSkipped = exercise?.exception?.scope === "exercise";

  const restTimer = useMemo(() => {
    if (!workout || !isAwaitingStart) return null;
    return computeSetRestTimer(exercise, currentSet, workout.server_now, serverReceivedAt);
  }, [workout, exercise, currentSet, isAwaitingStart, serverReceivedAt, timerTick]);

  const transitionTimer = useMemo(() => {
    if (!workout) return null;
    return computeTransitionTimer(
      exercise,
      workout.server_now,
      nextExercise ?? undefined,
      serverReceivedAt,
    );
  }, [workout, exercise, nextExercise, serverReceivedAt, timerTick]);

  const showTransition =
    exercise?.is_resolved &&
    nextExercise != null &&
    workout?.transition_to_exercise_position === exercisePosition + 1;

  const isCancelled = workout?.status === "cancelled";

  if (loading) {
    return (
      <>
        <AppHeader title="Exercise" showBack onBack={() => navigate(`/workouts/${workoutId}`)} />
        <Page width="reading">
          <LoadingState label="Loading exercise..." />
        </Page>
      </>
    );
  }

  if ((!loading && notFound) || (!loading && !exercise && workout)) {
    return (
      <>
        <AppHeader title="Exercise" showBack onBack={() => navigate(`/workouts/${workoutId}`)} />
        <Page width="reading">
          <EmptyState
            title="Exercise not found"
            description="This exercise is not part of the current workout."
            action={
              <Button variant="primary" onClick={() => navigate(`/workouts/${workoutId}`)}>
                Back to workout
              </Button>
            }
          />
        </Page>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AppHeader title="Exercise" showBack onBack={() => navigate(`/workouts/${workoutId}`)} />
        <Page width="reading">
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
        </Page>
      </>
    );
  }

  if (!exercise || !workout) return null;

  const plannedSets = exercise.planned_sets;

  const openAdjust = (ps: WorkoutPlannedSetSnapshot) => {
    setAdjustSet(ps);
    setAdjustError(null);
    if (ps.performance) {
      setAdjustValue(String(ps.performance.performed_value));
      setAdjustWeight(
        ps.performance.performed_weight_kg != null
          ? String(ps.performance.performed_weight_kg)
          : "",
      );
      setAdjustRir(
        ps.performance.performed_rir != null ? String(ps.performance.performed_rir) : "",
      );
    } else {
      if (adjustDraft) {
        setAdjustValue(adjustDraft.performed_value);
        setAdjustWeight(adjustDraft.performed_weight_kg);
        setAdjustRir(adjustDraft.performed_rir);
      } else {
        setAdjustValue(String(ps.target_value));
        setAdjustWeight(ps.target_weight_kg != null ? String(ps.target_weight_kg) : "");
        setAdjustRir(ps.target_rir != null ? String(ps.target_rir) : "");
      }
    }
  };

  const closeAdjust = () => {
    if (!adjusting) {
      setAdjustSet(null);
      setAdjustError(null);
    }
  };

  const isExerciseStarted = exercise.started_at != null;

  const skipNoteError =
    skipReason === "other" && !skipNote.trim()
      ? "A note is required when 'Other' is selected."
      : null;

  return (
    <>
      <AppHeader
        title={exercise.exercise_name}
        showBack
        onBack={() => navigate(`/workouts/${workoutId}`)}
      />
      <Page width="reading">
        <div className={styles.stack5}>
          {saveError && (
            <Alert variant="error">
              <span>{saveError}</span>
            </Alert>
          )}

          {isCancelled && <Alert variant="warning">This workout has been cancelled.</Alert>}

          {showTransition && nextExercise && transitionTimer && (
            <Card>
              <div className={`${styles.stack4} ${styles.centered}`}>
                {isExerciseSkipped ? (
                  <Badge variant="warning">Skipped</Badge>
                ) : exercise.execution_status === "partial" ? (
                  <Badge variant="accent">Partial</Badge>
                ) : (
                  <Badge variant="success">Exercise complete</Badge>
                )}
                <div className={styles.stack2}>
                  <div className={styles.textCompactMuted}>Next</div>
                  <div className={styles.cardTitle}>{nextExercise.exercise_name}</div>
                  <div className={styles.textCompactMuted}>
                    {nextExercise.planned_sets.length}{" "}
                    {nextExercise.planned_sets.length === 1 ? "set" : "sets"} &middot;{" "}
                    {nextExercise.target_type === "repetitions"
                      ? "Repetitions"
                      : nextExercise.target_type === "duration_seconds"
                        ? "Duration"
                        : "Distance"}
                  </div>
                </div>
                <div
                  className={`${styles.timerCircle} ${styles.timerCircleLarge} ${transitionTimer.overtime ? styles.timerOvertime : ""}`}
                  role="timer"
                  aria-label={
                    transitionTimer.overtime
                      ? `Planned transition time exceeded. ${formatTimer(transitionTimer.seconds, false)} elapsed.`
                      : `${formatTimer(transitionTimer.seconds, false)} transition time elapsed.`
                  }
                >
                  {transitionTimer.overtime ? (
                    <ClockAlert size={18} aria-hidden="true" />
                  ) : (
                    <Clock3 size={18} aria-hidden="true" />
                  )}
                  <span className={styles.timerText}>
                    {formatTimer(transitionTimer.seconds, false)}
                  </span>
                </div>
                {isExerciseSkipped && (
                  <div className={`${styles.stack2} ${styles.centered}`}>
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={handleUndoExerciseSkip}
                      disabled={undoPending != null || isCancelled}
                    >
                      <Undo2 size={16} aria-hidden="true" />
                      <span>{undoPending?.exercise ? "Undoing..." : "Undo skip"}</span>
                    </Button>
                  </div>
                )}
                <Button
                  variant="primary"
                  fullWidth
                  onClick={async () => {
                    setTransitionStarting(true);
                    setSaveError(null);
                    try {
                      const result = await startExercise(workout.id, nextExercise.position);
                      if ("notFound" in result) {
                        setNotFound(true);
                        return;
                      }
                      if ("detail" in result) {
                        setSaveError(result.detail);
                        setTransitionStarting(false);
                        return;
                      }
                      applyWorkout(result);
                      navigate(`/workouts/${workout.id}/exercises/${nextExercise.position}`, {
                        replace: true,
                      });
                    } catch (err) {
                      handleApiError(err, "start exercise");
                    }
                  }}
                  disabled={transitionStarting || isCancelled}
                >
                  {transitionStarting ? "Starting..." : "Start next exercise"}
                </Button>
              </div>
            </Card>
          )}

          {!showTransition && (
            <>
              <Card>
                <div className={styles.stack3}>
                  <div className={styles.rowBetween}>
                    <div>
                      <div className={styles.textCompactMuted}>
                        {isExerciseSkipped && <Badge variant="warning">Skipped</Badge>}
                        {!isExerciseSkipped && isAwaitingStart && (
                          <Badge variant="accent">Awaiting set start</Badge>
                        )}
                        {!isExerciseSkipped && isSetInProgress && (
                          <Badge variant="accent">Set in progress</Badge>
                        )}
                        {!isExerciseSkipped &&
                          isExerciseStarted &&
                          !isAwaitingStart &&
                          !isSetInProgress &&
                          !currentSet && <Badge variant="accent">In progress</Badge>}
                        {!isExerciseSkipped && !isExerciseStarted && (
                          <Badge variant="default">Not started</Badge>
                        )}
                      </div>
                    </div>
                    {exercise.instructions ? (
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setInstructionsOpen(true)}
                      >
                        <Info size={16} aria-hidden="true" />
                        <span>How to do it</span>
                      </Button>
                    ) : (
                      <span className={styles.textCaptionSubtle}>
                        Instructions unavailable for this workout
                      </span>
                    )}
                  </div>

                  {isAwaitingStart && restTimer && (
                    <div className={styles.centered}>
                      <div
                        className={`${styles.timerCircle} ${restTimer.overtime ? styles.timerOvertime : ""}`}
                        role="timer"
                        aria-label={
                          restTimer.overtime
                            ? `${formatTimer(restTimer.seconds, true)} beyond planned set rest.`
                            : `${formatTimer(restTimer.seconds, false)} of planned set rest remaining.`
                        }
                      >
                        {restTimer.overtime ? (
                          <ClockAlert size={18} aria-hidden="true" />
                        ) : (
                          <Clock3 size={18} aria-hidden="true" />
                        )}
                        <span className={styles.timerText}>
                          {formatTimer(restTimer.seconds, restTimer.overtime)}
                        </span>
                      </div>
                      <div className={`${styles.textCompactMuted} ${styles.mt1}`}>
                        {restTimer.overtime ? "Overtime" : "Rest"}
                      </div>
                    </div>
                  )}

                  {isExerciseSkipped && (
                    <div className={`${styles.stack3} ${styles.centered}`}>
                      <div className={styles.textCompactMuted}>This exercise has been skipped.</div>
                      {exercise.exception?.reason_code && (
                        <div className={styles.textCompactMuted}>
                          Reason:{" "}
                          {SKIP_REASON_LABELS[exercise.exception.reason_code] ??
                            exercise.exception.reason_code}
                        </div>
                      )}
                      {exercise.exception?.note && (
                        <div className={styles.textCompactMuted}>{exercise.exception.note}</div>
                      )}
                      <Button
                        variant="secondary"
                        onClick={handleUndoExerciseSkip}
                        disabled={undoPending != null || isCancelled}
                      >
                        <Undo2 size={16} aria-hidden="true" />
                        <span>{undoPending?.exercise ? "Undoing..." : "Undo skip"}</span>
                      </Button>
                    </div>
                  )}

                  {!isExerciseSkipped && currentSet && (
                    <>
                      <div className={styles.centered}>
                        <div className={styles.textCompactMuted}>
                          Set {currentSet.position} of {plannedSets.length}
                        </div>
                      </div>
                      <div className={`${styles.stack1} ${styles.centered}`}>
                        <div className={styles.timerCircle}>
                          <span className={styles.timerTextLarge}>
                            {adjustDraft
                              ? targetLabel(
                                  exercise.target_type,
                                  Number(adjustDraft.performed_value) || currentSet.target_value,
                                )
                              : targetLabel(exercise.target_type, currentSet.target_value)}
                          </span>
                        </div>
                      </div>
                      <div className={`${styles.stack2} ${styles.centered}`}>
                        {currentSet.target_weight_kg != null && (
                          <span className={styles.textCompactMuted}>
                            {adjustDraft
                              ? `${adjustDraft.performed_weight_kg || currentSet.target_weight_kg} kg`
                              : `${currentSet.target_weight_kg} kg`}
                          </span>
                        )}
                        {currentSet.target_rir != null && (
                          <span className={styles.textCompactMuted}>
                            RIR{" "}
                            {adjustDraft
                              ? adjustDraft.performed_rir || currentSet.target_rir
                              : currentSet.target_rir}
                          </span>
                        )}
                        {currentSet.tempo != null && (
                          <span className={styles.textCompactMuted}>
                            Tempo: eccentric {currentSet.tempo.eccentric_seconds}s &middot; stretch
                            pause {currentSet.tempo.stretched_pause_seconds}s &middot; concentric{" "}
                            {currentSet.tempo.concentric_seconds}s &middot; peak contraction{" "}
                            {currentSet.tempo.peak_contraction_seconds}s
                          </span>
                        )}
                        {currentSet.rest_after_set_seconds != null && (
                          <span className={styles.textCompactMuted}>
                            Rest {currentSet.rest_after_set_seconds}s
                          </span>
                        )}
                        {currentSet.notes && (
                          <span className={styles.textCompactMuted}>{currentSet.notes}</span>
                        )}
                      </div>
                      {adjustDraft && (
                        <div className={`${styles.textCompactMuted} ${styles.centered}`}>
                          Adjusted values will be applied on completion
                        </div>
                      )}
                    </>
                  )}

                  {!isExerciseSkipped && !isExerciseStarted && (
                    <div className={styles.stack2}>
                      <Button
                        variant="primary"
                        fullWidth
                        onClick={handleStartExercise}
                        disabled={starting || isCancelled}
                      >
                        {starting ? "Starting..." : "Start first exercise"}
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => openSkipDialog("exercise")}
                        disabled={isCancelled}
                      >
                        <SkipForward size={16} aria-hidden="true" />
                        <span>Skip exercise</span>
                      </Button>
                    </div>
                  )}

                  {!isExerciseSkipped && isAwaitingStart && currentSet && (
                    <div className={styles.stack2}>
                      <Button
                        variant="primary"
                        fullWidth
                        className={styles.actionButton}
                        onClick={handleStartSet}
                        disabled={saving || isCancelled}
                      >
                        {saving ? "Starting..." : `Start set ${currentSet.position}`}
                      </Button>
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => openAdjust(currentSet)}
                        disabled={saving || isCancelled}
                      >
                        Adjust set
                      </Button>
                      <div className={styles.row2}>
                        <Button
                          variant="ghost"
                          fullWidth
                          onClick={() => openSkipDialog("set")}
                          disabled={saving || isCancelled}
                        >
                          <SkipForward size={16} aria-hidden="true" />
                          <span>Skip set</span>
                        </Button>
                        <Button
                          variant="ghost"
                          fullWidth
                          onClick={() => openSkipDialog("exercise")}
                          disabled={saving || isCancelled}
                        >
                          <span>Skip exercise</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {!isExerciseSkipped && isSetInProgress && currentSet && (
                    <div className={styles.stack2}>
                      <Button
                        variant="primary"
                        fullWidth
                        className={styles.actionButton}
                        onClick={() => handleRecordSet(currentSet.position)}
                        disabled={saving || isCancelled}
                      >
                        {saving
                          ? "Saving..."
                          : currentSet.position === plannedSets.length
                            ? "Finish exercise"
                            : "Next set"}
                      </Button>
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => openAdjust(currentSet)}
                        disabled={saving || isCancelled}
                      >
                        Adjust set
                      </Button>
                      <div className={styles.row2}>
                        <Button
                          variant="ghost"
                          fullWidth
                          onClick={() => openSkipDialog("set")}
                          disabled={saving || isCancelled}
                        >
                          <SkipForward size={16} aria-hidden="true" />
                          <span>Skip set</span>
                        </Button>
                        <Button
                          variant="ghost"
                          fullWidth
                          onClick={() => openSkipDialog("exercise")}
                          disabled={saving || isCancelled}
                        >
                          <span>Skip exercise</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {!isExerciseSkipped && isExerciseStarted && !currentSet && !showTransition && (
                    <div className={`${styles.stack4} ${styles.centered}`}>
                      {exercise.execution_status === "partial" ? (
                        <Badge variant="accent">Partial</Badge>
                      ) : (
                        <Badge variant="success">Exercise complete</Badge>
                      )}
                      <div className={styles.textCompactMuted}>
                        {exercise.execution_status === "partial"
                          ? `${exercise.completed_set_count} recorded · ${exercise.skipped_set_count} skipped`
                          : `All ${plannedSets.length} set${plannedSets.length === 1 ? "" : "s"} recorded`}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <div className={styles.stack3}>
                <div className={styles.textCompactMuted}>
                  {exercise.completed_set_count} completed
                  {exercise.skipped_set_count > 0 &&
                    ` · ${exercise.skipped_set_count} skipped`}{" "}
                  &middot; {exercise.total_set_count} set
                  {exercise.total_set_count === 1 ? "" : "s"}
                  {exercise.execution_status === "partial" && " (partial)"}
                  {exercise.execution_status === "skipped" && " (skipped)"}
                </div>
                {plannedSets.map((ps) => {
                  if (ps.performance) {
                    const perf = ps.performance!;
                    return (
                      <div
                        key={ps.position}
                        className={`${styles.setSummary} ${perf.entry_mode === "adjusted" ? styles.setSummaryAdjusted : ""}`}
                      >
                        <div className={styles.rowBetween}>
                          <div className={styles.row2}>
                            <Check size={16} className={styles.setCheck} />
                            <span className={styles.setLabel}>Set {ps.position}</span>
                            <span className={styles.setValue}>
                              {performedLabel(exercise.target_type, perf)}
                            </span>
                            {perf.entry_mode === "adjusted" && (
                              <Badge variant="warning">Adjusted</Badge>
                            )}
                          </div>
                          <div className={styles.row1}>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => openAdjust(ps)}
                              aria-label={`Edit set ${ps.position}`}
                              disabled={isCancelled}
                            >
                              <Edit3 size={14} aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => handleMarkIncomplete(ps.position)}
                              aria-label={`Mark set ${ps.position} incomplete`}
                              disabled={saving || isCancelled}
                            >
                              <X size={14} aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                        <div className={`${styles.textCompactMuted} ${styles.mt1}`}>
                          {performedSetSummary(perf)}
                        </div>
                      </div>
                    );
                  }
                  if (ps.exception) {
                    const exc = ps.exception;
                    return (
                      <div key={ps.position} className={styles.setSummary}>
                        <div className={styles.rowBetween}>
                          <div className={styles.row2}>
                            <SkipForward size={16} className={styles.textCaptionMuted} />
                            <span className={styles.setLabel}>Set {ps.position}</span>
                            <span className={styles.textCompactMuted}>
                              Skipped
                              {exc.scope === "exercise" && " (exercise)"}
                            </span>
                          </div>
                          {exc.scope === "set" && (
                            <div className={styles.row1}>
                              <Button
                                variant="ghost"
                                size="small"
                                onClick={() => handleUndoSetSkip(ps.position)}
                                aria-label={`Undo skip set ${ps.position}`}
                                disabled={undoPending != null || isCancelled}
                              >
                                {undoPending?.setPos === ps.position ? (
                                  <span className={styles.textCompactMuted}>Undoing...</span>
                                ) : (
                                  <Undo2 size={14} aria-hidden="true" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                        {exc.reason_code && (
                          <div className={`${styles.textCompactMuted} ${styles.mt1}`}>
                            {SKIP_REASON_LABELS[exc.reason_code] ?? exc.reason_code}
                          </div>
                        )}
                        {exc.note && (
                          <div className={`${styles.textCompactMuted} ${styles.mt1}`}>
                            {exc.note}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={ps.position} className={styles.setSummary}>
                      <div className={styles.rowBetween}>
                        <div className={styles.row2}>
                          <span className={styles.setDot} aria-hidden="true" />
                          <span className={styles.setLabel}>Set {ps.position}</span>
                          <span className={styles.textCompactMuted}>
                            {targetLabel(exercise.target_type, ps.target_value)}
                          </span>
                        </div>
                      </div>
                      <div className={`${styles.textCompactMuted} ${styles.mt1}`}>
                        {ps.target_weight_kg != null && `@ ${ps.target_weight_kg} kg `}
                        {ps.target_rir != null && `RIR ${ps.target_rir}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Page>

      <Dialog
        open={instructionsOpen}
        title="How to do it"
        onClose={() => setInstructionsOpen(false)}
      >
        <div className={styles.stack3}>
          {exercise.instructions ? (
            <p className={styles.preWrap}>{exercise.instructions}</p>
          ) : (
            <p className={styles.textCompactMuted}>No instructions available.</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={adjustSet != null}
        title={`Set ${adjustSet?.position ?? ""}`}
        onClose={closeAdjust}
        actions={
          <div className={styles.row2}>
            <Button variant="secondary" onClick={closeAdjust} disabled={adjusting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (adjustSet) {
                  if (adjustSet.performance) {
                    handleUpdateSet(adjustSet.position);
                  } else {
                    handleApplyAdjustments();
                  }
                }
              }}
              disabled={adjusting}
            >
              {adjusting
                ? "Saving..."
                : adjustSet?.performance
                  ? "Update set"
                  : "Apply adjustments"}
            </Button>
          </div>
        }
      >
        <div className={styles.stack3}>
          {adjustError && <Alert variant="error">{adjustError}</Alert>}
          <Field label="Performed" htmlFor="adjust-value">
            <TextInput
              id="adjust-value"
              inputMode="numeric"
              value={adjustValue}
              onChange={(e) => setAdjustValue(e.target.value)}
            />
          </Field>
          <Field label="Weight (kg)" optional htmlFor="adjust-weight">
            <TextInput
              id="adjust-weight"
              inputMode="decimal"
              value={adjustWeight}
              onChange={(e) => setAdjustWeight(e.target.value)}
            />
          </Field>
          <Field label="RIR" optional htmlFor="adjust-rir">
            <TextInput
              id="adjust-rir"
              inputMode="numeric"
              value={adjustRir}
              onChange={(e) => setAdjustRir(e.target.value)}
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={skipDialogOpen != null}
        title={
          skipDialogOpen === "set"
            ? `Skip set ${currentSet?.position ?? ""}`
            : `Skip ${exercise.exercise_name}`
        }
        onClose={closeSkipDialog}
        actions={
          <div className={styles.row2}>
            <Button variant="secondary" onClick={closeSkipDialog} disabled={skipPending}>
              {skipDialogOpen === "set" ? "Keep set" : "Keep exercise"}
            </Button>
            <Button
              variant="primary"
              onClick={handleSkipConfirm}
              disabled={skipPending || (skipReason === "other" && !skipNote.trim())}
            >
              {skipPending
                ? "Skipping..."
                : skipDialogOpen === "set"
                  ? "Skip set"
                  : "Skip exercise"}
            </Button>
          </div>
        }
      >
        <div className={styles.stack3}>
          {skipError && <Alert variant="error">{skipError}</Alert>}
          {skipDialogOpen === "exercise" && (
            <p className={styles.textCompactMuted}>
              This will skip only the remaining sets. Any already performed sets will be preserved.
            </p>
          )}
          {skipDialogOpen === "set" && (
            <p className={styles.textCompactMuted}>
              Skipping set {currentSet?.position} of {exercise.exercise_name}.
            </p>
          )}
          <Field label="Reason" optional htmlFor="skip-reason">
            <Select
              id="skip-reason"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
            >
              <option value="">No reason</option>
              {SKIP_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {SKIP_REASON_LABELS[code]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Details" optional={skipReason !== "other"} htmlFor="skip-note">
            <TextArea
              id="skip-note"
              value={skipNote}
              onChange={(e) => setSkipNote(e.target.value)}
              rows={2}
            />
          </Field>
          {skipNoteError && (
            <span className={styles.textCaptionWarning} role="alert">
              {skipNoteError}
            </span>
          )}
        </div>
      </Dialog>
    </>
  );
}
