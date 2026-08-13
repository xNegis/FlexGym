import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Dumbbell } from "lucide-react";
import { fetchExerciseChart, fetchExerciseHistory, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type {
  ExerciseChartItem,
  ExerciseHistoryMetric,
  ExerciseHistorySession,
  ExerciseHistorySet,
  ProgressPeriod,
} from "../types";
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
  heaviest_weight: "Heaviest weight",
  estimated_1rm: "Estimated 1RM",
};

const METRIC_EXPLANATIONS: Record<ExerciseHistoryMetric, string> = {
  heaviest_weight:
    "Each point is the heaviest weight recorded for this exercise in one workout. Sessions without a positive recorded weight are not plotted.",
  estimated_1rm:
    "Each point is the strongest Epley estimated one-rep max (weight × (1 + reps ÷ 30)) in one workout. Sessions without a positive recorded weight are not plotted.",
};

const PERIOD_VALUES: ProgressPeriod[] = ["1m", "3m", "6m", "1y", "all"];

const PERIOD_LABELS: Record<ProgressPeriod, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  all: "All",
};

function localToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildQuery(metric: ExerciseHistoryMetric, period: ProgressPeriod): string {
  const params = new URLSearchParams();
  if (metric === "heaviest_weight") params.set("metric", "heaviest_weight");
  if (period !== "3m") params.set("period", period);
  return params.toString();
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

function formatLocalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatKg(value: number): string {
  return `${Number(value.toFixed(1))} kg`;
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

  const localDate = localToday();

  const metricValues = searchParams.getAll("metric");
  const rawMetric = metricValues.length === 1 ? metricValues[0] : null;
  const metric: ExerciseHistoryMetric =
    rawMetric === "heaviest_weight" ? "heaviest_weight" : "estimated_1rm";

  const periodValues = searchParams.getAll("period");
  const rawPeriod = periodValues.length === 1 ? periodValues[0] : null;
  const period: ProgressPeriod = PERIOD_VALUES.includes(rawPeriod as ProgressPeriod)
    ? (rawPeriod as ProgressPeriod)
    : "3m";

  const canonicalQuery = buildQuery(metric, period);

  useEffect(() => {
    if (searchParams.toString() !== canonicalQuery) {
      setSearchParams(canonicalQuery, { replace: true });
    }
  }, [searchParams, canonicalQuery, setSearchParams]);

  const [exerciseName, setExerciseName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [hasAnyHistory, setHasAnyHistory] = useState<boolean | null>(null);

  const [chartItems, setChartItems] = useState<ExerciseChartItem[] | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const [historyItems, setHistoryItems] = useState<ExerciseHistorySession[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loadMoreStatus, setLoadMoreStatus] = useState<string | null>(null);

  const chartRequestSequence = useRef(0);
  const historyRequestSequence = useRef(0);
  const currentSlug = useRef(slug);
  const loadMoreStatusRef = useRef<HTMLDivElement>(null);

  const loadChart = useCallback(async () => {
    if (!slug) return;
    const requestId = ++chartRequestSequence.current;
    setChartItems(null);
    setChartError(null);
    try {
      const result = await fetchExerciseChart(slug, period, localDate);
      if (requestId !== chartRequestSequence.current) return;
      if ("notFound" in result) {
        setNotFound(true);
        return;
      }
      setExerciseName(result.exercise.name);
      setHasAnyHistory(result.has_any_history);
      setChartItems(result.items);
    } catch (err) {
      if (requestId !== chartRequestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setChartError("Unable to load this chart. Please try again.");
    }
  }, [slug, period, localDate, logout]);

  const loadHistory = useCallback(async () => {
    if (!slug) return;
    const requestId = ++historyRequestSequence.current;
    setHistoryItems(null);
    setNextCursor(null);
    setHistoryError(null);
    setLoadMoreError(null);
    setLoadMoreStatus(null);
    setLoadingMore(false);
    try {
      const result = await fetchExerciseHistory(slug, { period, localDate });
      if (requestId !== historyRequestSequence.current) return;
      if ("notFound" in result) {
        setNotFound(true);
        return;
      }
      setExerciseName(result.exercise.name);
      setHasAnyHistory(result.has_any_history);
      setHistoryItems(result.items);
      setNextCursor(result.next_cursor);
    } catch (err) {
      if (requestId !== historyRequestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setHistoryError("Unable to load exercise history. Please try again.");
    }
  }, [slug, period, localDate, logout]);

  useEffect(() => {
    if (currentSlug.current !== slug) {
      currentSlug.current = slug;
      setExerciseName(null);
    }
    setNotFound(false);
    setHasAnyHistory(null);
    void loadChart();
    void loadHistory();
  }, [loadChart, loadHistory]);

  const loadMore = useCallback(async () => {
    if (!slug || loadingMore || nextCursor == null) return;
    const requestId = historyRequestSequence.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    setLoadMoreStatus(null);
    try {
      const result = await fetchExerciseHistory(slug, { period, localDate, cursor: nextCursor });
      if (requestId !== historyRequestSequence.current) return;
      if ("notFound" in result) {
        setLoadMoreError("Unable to load more history. Please try again.");
        return;
      }
      setHistoryItems((prev) => [...(prev ?? []), ...result.items]);
      setNextCursor(result.next_cursor);
      setLoadMoreStatus(
        result.next_cursor === null ? "All older sessions loaded." : "Older sessions loaded.",
      );
      if (result.next_cursor === null) {
        requestAnimationFrame(() => loadMoreStatusRef.current?.focus());
      }
    } catch (err) {
      if (requestId !== historyRequestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadMoreError("Unable to load more history. Please try again.");
    } finally {
      if (requestId === historyRequestSequence.current) {
        setLoadingMore(false);
      }
    }
  }, [slug, period, localDate, loadingMore, nextCursor, logout]);

  const chartPoints = useMemo(() => {
    if (chartItems === null) return [];
    return chartItems.map((item) => ({
      workoutId: item.workout_id,
      date: item.local_date,
      value: metric === "heaviest_weight" ? item.heaviest_weight_kg : item.estimated_1rm_kg,
      status: item.status,
      sessionName: item.selected_training_day_name,
      sets: item.sets,
    }));
  }, [chartItems, metric]);

  const historyLoaded = historyItems !== null && !historyError;
  const chartLoaded = chartItems !== null && !chartError;

  const globalEmpty = !notFound && historyLoaded && hasAnyHistory === false && !historyError;
  const periodEmpty =
    !notFound &&
    historyLoaded &&
    hasAnyHistory === true &&
    historyItems.length === 0 &&
    !historyError;
  const weightUnavailable =
    !notFound &&
    chartLoaded &&
    historyLoaded &&
    historyItems.length > 0 &&
    chartItems.length === 0 &&
    !chartError &&
    !historyError;

  const chartTitle = `${exerciseName ?? "Exercise"} — ${METRIC_LABELS[metric]}`;

  const metricNavItems = [
    {
      value: "estimated_1rm",
      label: "Estimated 1RM",
      to: withQuery(`/progress/exercises/${slug ?? ""}`, buildQuery("estimated_1rm", period)),
      active: metric === "estimated_1rm",
    },
    {
      value: "heaviest_weight",
      label: "Heaviest weight",
      to: withQuery(`/progress/exercises/${slug ?? ""}`, buildQuery("heaviest_weight", period)),
      active: metric === "heaviest_weight",
    },
  ];

  const periodNavItems = PERIOD_VALUES.map((value) => ({
    value,
    label: PERIOD_LABELS[value],
    to: withQuery(`/progress/exercises/${slug ?? ""}`, buildQuery(metric, value)),
    active: period === value,
  }));

  const viewAllHistory = () => {
    navigate(withQuery(`/progress/exercises/${slug ?? ""}`, buildQuery(metric, "all")));
  };

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

        {!notFound && globalEmpty && (
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

        {!notFound && !globalEmpty && (
          <div className={styles.stack5}>
            <Section title="Performance">
              <div className={styles.stack3}>
                <SectionNav label="Select time range" items={periodNavItems} />
                <SectionNav label="Select metric" items={metricNavItems} />

                {periodEmpty && (
                  <EmptyState
                    title="No sessions in this period"
                    description="No recorded sessions for this exercise fall within the selected time range."
                    action={
                      period !== "all" ? (
                        <Button variant="primary" onClick={viewAllHistory}>
                          View all history
                        </Button>
                      ) : undefined
                    }
                  />
                )}

                {!periodEmpty && chartError && (
                  <Alert variant="error">
                    <div className={styles.stack2}>
                      <span>{chartError}</span>
                      <Button variant="secondary" size="small" onClick={loadChart}>
                        Retry
                      </Button>
                    </div>
                  </Alert>
                )}

                {!periodEmpty && !chartError && chartItems === null && (
                  <LoadingState label="Loading chart..." />
                )}

                {!periodEmpty &&
                  !chartError &&
                  chartItems !== null &&
                  chartItems.length === 0 &&
                  historyItems === null &&
                  !historyError && <LoadingState label="Loading session context..." />}

                {!periodEmpty && !chartError && weightUnavailable && (
                  <Alert variant="info">
                    <p>
                      No weight data to chart. A positive performed weight is required to plot this
                      exercise.
                    </p>
                  </Alert>
                )}

                {!periodEmpty && !chartError && chartItems !== null && chartItems.length > 0 && (
                  <div>
                    <ExerciseHistoryChart title={chartTitle} points={chartPoints} />
                    <p className={`${styles.textCompactMuted} ${styles.mt2}`}>
                      {METRIC_EXPLANATIONS[metric]}
                    </p>
                  </div>
                )}
              </div>
            </Section>

            {!periodEmpty && (
              <Section title="Session history">
                {historyError ? (
                  <Alert variant="error">
                    <div className={styles.stack2}>
                      <span>{historyError}</span>
                      <Button variant="secondary" size="small" onClick={loadHistory}>
                        Retry
                      </Button>
                    </div>
                  </Alert>
                ) : historyItems === null ? (
                  <LoadingState label="Loading session history..." />
                ) : (
                  <div className={styles.stack3}>
                    {historyItems.map((session) => (
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
                            <div className={styles.cardTitle}>
                              {session.selected_training_day_name}
                            </div>
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
                                  <div className={styles.textCaptionSubtle}>
                                    Occurrence {index + 1}
                                  </div>
                                )}
                                {occurrence.map((set) => (
                                  <div
                                    key={`${set.exercise_position}-${set.set_position}`}
                                    className={styles.textCompactMuted}
                                  >
                                    <span>
                                      Set {set.set_position}: {set.performed_reps} reps
                                    </span>
                                    {set.performed_weight_kg !== null &&
                                      set.performed_weight_kg > 0 && (
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
                )}
              </Section>
            )}

            {!periodEmpty && !historyError && historyItems !== null && (
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
            )}
          </div>
        )}
      </Page>
    </>
  );
}
