import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Dumbbell } from "lucide-react";
import { fetchExerciseHistory, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { ExerciseHistoryMetric, ExerciseHistorySession, ExerciseHistorySet } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import SectionNav from "../ui/SectionNav";
import Section from "../ui/Section";
import ExerciseHistoryChart from "../components/ExerciseHistoryChart";
import styles from "./Screen.module.css";

const METRIC_LABELS: Record<ExerciseHistoryMetric, string> = {
  total_reps: "Total reps",
  heaviest_weight: "Heaviest weight",
  estimated_1rm: "Estimated 1RM",
};

const METRIC_EXPLANATIONS: Record<ExerciseHistoryMetric, string> = {
  total_reps: "Each point is the total repetitions performed for this exercise in one workout.",
  heaviest_weight:
    "Each point is the heaviest weight recorded for this exercise in one workout. Workouts without a recorded weight are not plotted.",
  estimated_1rm:
    "Each point is the strongest Epley estimated one-rep max (weight × (1 + reps ÷ 30)) in one workout. Workouts without a recorded weight are not plotted.",
};

function formatLocalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatKg(value: number): string {
  return `${Number(value.toFixed(1))} kg`;
}

function metricValue(
  session: ExerciseHistorySession,
  metric: ExerciseHistoryMetric,
): number | null {
  if (metric === "total_reps") return session.total_reps;
  if (metric === "heaviest_weight") return session.heaviest_weight_kg;
  return session.estimated_1rm_kg;
}

function groupSetsByOccurrence(sets: ExerciseHistorySet[]): ExerciseHistorySet[][] {
  const occurrences = new Map<number, ExerciseHistorySet[]>();
  for (const set of sets) {
    const group = occurrences.get(set.exercise_position) ?? [];
    group.push(set);
    occurrences.set(set.exercise_position, group);
  }
  return Array.from(occurrences.values());
}

export default function ExerciseHistoryScreen() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();

  const metricValues = searchParams.getAll("metric");
  const rawMetric = metricValues.length === 1 ? metricValues[0] : null;
  const metric: ExerciseHistoryMetric =
    rawMetric === "heaviest_weight" || rawMetric === "estimated_1rm" ? rawMetric : "total_reps";

  useEffect(() => {
    const valid =
      metricValues.length === 1 &&
      (metricValues[0] === "heaviest_weight" || metricValues[0] === "estimated_1rm");
    if (!valid && metricValues.length > 0) {
      const params = new URLSearchParams(searchParams);
      params.delete("metric");
      setSearchParams(params, { replace: true });
    }
  }, [metricValues, searchParams, setSearchParams]);

  const [exerciseName, setExerciseName] = useState<string | null>(null);
  const [items, setItems] = useState<ExerciseHistorySession[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loadMoreStatus, setLoadMoreStatus] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const loadMoreStatusRef = useRef<HTMLDivElement>(null);

  const loadFirstPage = useCallback(async () => {
    if (!slug) return;
    const requestId = ++requestSequence.current;
    setItems(null);
    setExerciseName(null);
    setNextCursor(null);
    setNotFound(false);
    setInitialError(null);
    setLoadMoreError(null);
    setLoadMoreStatus(null);
    try {
      const result = await fetchExerciseHistory(slug);
      if (requestId !== requestSequence.current) return;
      if ("notFound" in result) {
        setNotFound(true);
      } else {
        setExerciseName(result.exercise.name);
        setItems(result.items);
        setNextCursor(result.next_cursor);
      }
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setInitialError("Unable to load exercise history. Please try again.");
    }
  }, [slug, logout]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!slug || loadingMore || nextCursor == null) return;
    const requestId = requestSequence.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    setLoadMoreStatus(null);
    try {
      const result = await fetchExerciseHistory(slug, { cursor: nextCursor });
      if (requestId !== requestSequence.current) return;
      if ("notFound" in result) {
        setLoadMoreError("Unable to load more history. Please try again.");
        return;
      }
      setItems((prev) => [...(prev ?? []), ...result.items]);
      setNextCursor(result.next_cursor);
      setLoadMoreStatus(
        result.next_cursor === null ? "All older sessions loaded." : "Older sessions loaded.",
      );
      if (result.next_cursor === null) {
        requestAnimationFrame(() => loadMoreStatusRef.current?.focus());
      }
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadMoreError("Unable to load more history. Please try again.");
    } finally {
      if (requestId === requestSequence.current) {
        setLoadingMore(false);
      }
    }
  }, [slug, loadingMore, nextCursor, logout]);

  const chartPoints = useMemo(() => {
    if (items === null) return [];
    const source = items.map((session) => ({
      workoutId: session.workout_id,
      date: session.local_date,
      value: metricValue(session, metric),
      status: session.status,
      sessionName: session.selected_training_day_name,
      sets: session.sets,
    }));
    return source.reverse();
  }, [items, metric]);

  const metricUnit: "reps" | "kg" = metric === "total_reps" ? "reps" : "kg";

  const showEmpty = items !== null && items.length === 0 && !initialError && !notFound;
  const metricUnavailable =
    metric !== "total_reps" &&
    chartPoints.every((point) => point.value === null) &&
    items !== null &&
    items.length > 0;

  const chartTitle = `${exerciseName ?? "Exercise"} — ${METRIC_LABELS[metric]}`;
  const metricNavItems = [
    {
      value: "total_reps",
      label: "Total reps",
      to: `/progress/exercises/${slug ?? ""}`,
      active: metric === "total_reps",
    },
    {
      value: "heaviest_weight",
      label: "Heaviest weight",
      to: `/progress/exercises/${slug ?? ""}?metric=heaviest_weight`,
      active: metric === "heaviest_weight",
    },
    {
      value: "estimated_1rm",
      label: "Estimated 1RM",
      to: `/progress/exercises/${slug ?? ""}?metric=estimated_1rm`,
      active: metric === "estimated_1rm",
    },
  ];

  return (
    <>
      <AppHeader
        title={notFound ? "Exercise not found" : (exerciseName ?? "Exercise history")}
        showBack
        onBack={() => navigate("/progress/exercises")}
      />
      <Page width="reading">
        {notFound && (
          <EmptyState
            icon={<Dumbbell size={32} />}
            title="Exercise not found"
            description="This exercise is no longer available."
            action={
              <Button variant="primary" onClick={() => navigate("/progress/exercises")}>
                Back to exercises
              </Button>
            }
          />
        )}

        {!notFound && initialError && (
          <div className={styles.mb4}>
            <Alert variant="error">
              <div className={styles.stack2}>
                <span>{initialError}</span>
                <Button variant="secondary" size="small" onClick={loadFirstPage}>
                  Retry
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {!notFound && !initialError && items === null && (
          <div className={styles.stack5}>
            <Section title="Performance">
              <div className={styles.stack3}>
                <SectionNav label="Select metric" items={metricNavItems} />
                <LoadingState label="Loading chart..." />
              </div>
            </Section>
            <Section title="Session history">
              <LoadingState label="Loading session history..." />
            </Section>
          </div>
        )}

        {!notFound && !initialError && showEmpty && (
          <EmptyState
            icon={<Dumbbell size={32} />}
            title="No recorded performance for this exercise"
            description="Performed repetition sets in a completed or cancelled workout will appear here."
            action={
              <Button variant="primary" onClick={() => navigate("/progress/exercises")}>
                Back to exercises
              </Button>
            }
          />
        )}

        {!notFound && !initialError && items !== null && items.length > 0 && (
          <div className={styles.stack5}>
            <Section title="Performance">
              <div className={styles.stack3}>
                <SectionNav label="Select metric" items={metricNavItems} />

                {metricUnavailable ? (
                  <Alert variant="info">
                    <p>No performed weight was recorded for this exercise.</p>
                  </Alert>
                ) : (
                  <div>
                    <ExerciseHistoryChart
                      title={chartTitle}
                      unit={metricUnit}
                      points={chartPoints}
                    />
                    <p className={`${styles.textCompactMuted} ${styles.mt2}`}>
                      {METRIC_EXPLANATIONS[metric]}
                    </p>
                  </div>
                )}
              </div>
            </Section>

            <Section title="Session history">
              <div className={styles.stack3}>
                {items.map((session) => (
                  <Card
                    key={session.workout_id}
                    clickable
                    onClick={() => navigate(`/workouts/${session.workout_id}`)}
                    className={styles.cardLink}
                  >
                    <div className={`${styles.stack2} ${styles.flex1}`}>
                      <div className={styles.rowBetween}>
                        <span className={styles.textCaptionSubtle}>
                          {formatLocalDate(session.local_date)}
                        </span>
                        <Badge variant={session.status === "completed" ? "success" : "warning"}>
                          {session.status === "completed" ? "Completed" : "Cancelled"}
                        </Badge>
                      </div>
                      <div>
                        <div className={styles.cardTitle}>{session.selected_training_day_name}</div>
                        <div className={styles.cardMeta}>{session.routine_name}</div>
                      </div>
                      <div className={styles.textCompactMuted}>
                        <span>Total reps: {session.total_reps}</span>
                        {session.heaviest_weight_kg !== null && (
                          <span> · Heaviest: {formatKg(session.heaviest_weight_kg)}</span>
                        )}
                        {session.estimated_1rm_kg !== null && (
                          <span> · Est. 1RM: {formatKg(session.estimated_1rm_kg)}</span>
                        )}
                      </div>
                      <div className={styles.stack1}>
                        {groupSetsByOccurrence(session.sets).map((occurrence, index, all) => (
                          <div key={occurrence[0].exercise_position} className={styles.stack1}>
                            {all.length > 1 && (
                              <div className={styles.textCaptionSubtle}>Occurrence {index + 1}</div>
                            )}
                            {occurrence.map((set) => (
                              <div
                                key={`${set.exercise_position}-${set.set_position}`}
                                className={styles.textCompactMuted}
                              >
                                <span>
                                  Set {set.set_position}: {set.performed_reps} reps
                                </span>
                                {set.performed_weight_kg !== null && (
                                  <span> · {formatKg(set.performed_weight_kg)}</span>
                                )}
                                {set.performed_rir !== null && (
                                  <span> · RIR {set.performed_rir}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    <ChevronRight size={16} aria-hidden="true" className={styles.chevron} />
                  </Card>
                ))}
              </div>
            </Section>

            <div>
              {nextCursor != null && (
                <Button variant="primary" fullWidth onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              )}
              <div
                ref={loadMoreStatusRef}
                role="status"
                aria-live="polite"
                tabIndex={-1}
                className={loadMoreStatus ? styles.mt2 : undefined}
              >
                {loadMoreStatus}
              </div>
              {loadMoreError && (
                <div className={styles.mt2}>
                  <Alert variant="error">
                    <div className={styles.stack2}>
                      <span>{loadMoreError}</span>
                      <Button variant="secondary" size="small" onClick={loadMore}>
                        Retry
                      </Button>
                    </div>
                  </Alert>
                </div>
              )}
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
