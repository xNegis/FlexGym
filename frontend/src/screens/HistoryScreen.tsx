import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ClipboardList } from "lucide-react";
import { fetchWorkoutHistory, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { WorkoutHistoryItem } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import SegmentedControl from "../ui/SegmentedControl";
import SectionNav from "../ui/SectionNav";
import styles from "./Screen.module.css";

type HistoryFilter = "all" | "completed" | "cancelled";

const FILTER_OPTIONS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function formatLocalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function countText(item: WorkoutHistoryItem): string {
  const parts = [`${item.completed_set_count} performed`, `${item.skipped_set_count} skipped`];
  if (item.status === "cancelled" && item.unresolved_set_count > 0) {
    parts.push(`${item.unresolved_set_count} unresolved`);
  }
  parts.push(`${item.total_set_count} total`);
  return parts.join(" · ");
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();

  const statusValues = searchParams.getAll("status");
  const rawStatus = statusValues.length === 1 ? statusValues[0] : "";
  const filter: HistoryFilter =
    rawStatus === "completed" || rawStatus === "cancelled" ? rawStatus : "all";
  const hasValidStatus = filter !== "all";
  const queryKeys = Array.from(searchParams.keys());
  const hasCanonicalQuery =
    queryKeys.every((key) => key === "status") &&
    ((statusValues.length === 0 && filter === "all") ||
      (statusValues.length === 1 && hasValidStatus));

  const [items, setItems] = useState<WorkoutHistoryItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!hasCanonicalQuery) {
      setSearchParams(new URLSearchParams(), { replace: true });
    }
  }, [hasCanonicalQuery, setSearchParams]);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setItems(null);
    setNextCursor(null);
    setInitialError(null);
    setLoadMoreError(null);
    try {
      const page = await fetchWorkoutHistory(filter === "all" ? {} : { status: filter });
      if (requestId !== requestSequence.current) return;
      setItems(page.items);
      setNextCursor(page.next_cursor);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setInitialError("Unable to load workout history. Please try again.");
    }
  }, [filter, logout]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || nextCursor == null) return;
    const requestId = requestSequence.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchWorkoutHistory(
        filter === "all" ? { cursor: nextCursor } : { status: filter, cursor: nextCursor },
      );
      if (requestId !== requestSequence.current) return;
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadMoreError("Unable to load more workouts. Please try again.");
    } finally {
      if (requestId === requestSequence.current) {
        setLoadingMore(false);
      }
    }
  }, [loadingMore, nextCursor, filter, logout]);

  const changeFilter = (value: HistoryFilter) => {
    setSearchParams(value === "all" ? new URLSearchParams() : { status: value });
  };

  const showEmpty = items !== null && items.length === 0 && !initialError;
  const showFilteredEmpty = showEmpty && filter !== "all";

  return (
    <>
      <AppHeader title="Progress" />
      <Page width="reading">
        <p className={`${styles.textCompactMuted} ${styles.mb4}`}>
          Completed and cancelled workouts appear here, newest first.
        </p>

        <div className={styles.mb4}>
          <SectionNav
            label="Progress sections"
            items={[
              { value: "workouts", label: "Workouts", to: "/progress/workouts", active: true },
              { value: "exercises", label: "Exercises", to: "/progress/exercises", active: false },
              {
                value: "statistics",
                label: "Statistics",
                to: "/progress/statistics",
                active: false,
              },
            ]}
          />
        </div>

        <div className={styles.mb4}>
          <SegmentedControl
            name="history-filter"
            label="Filter workouts by status"
            value={filter}
            options={FILTER_OPTIONS}
            onChange={changeFilter}
          />
        </div>

        {initialError && (
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

        {items === null && !initialError && <LoadingState label="Loading workouts..." />}

        {showEmpty && !showFilteredEmpty && (
          <EmptyState
            icon={<ClipboardList size={32} />}
            title="No workouts yet"
            description="Completed and cancelled workouts will appear here."
            action={
              <Button variant="primary" onClick={() => navigate("/today")}>
                Go to Today
              </Button>
            }
          />
        )}

        {showFilteredEmpty && (
          <EmptyState
            icon={<ClipboardList size={32} />}
            title="No matching workouts"
            description="No workouts match this filter."
            action={
              <Button variant="primary" onClick={() => changeFilter("all")}>
                Show all
              </Button>
            }
          />
        )}

        {items !== null && items.length > 0 && (
          <div className={styles.stack2}>
            {items.map((item) => (
              <Card
                key={item.id}
                clickable
                onClick={() => navigate(`/workouts/${item.id}`)}
                className={styles.cardLink}
              >
                <div className={`${styles.stack2} ${styles.flex1}`}>
                  <div className={styles.rowBetween}>
                    <span className={styles.textCaptionSubtle}>
                      {formatLocalDate(item.local_date)}
                    </span>
                    <Badge variant={item.status === "completed" ? "success" : "warning"}>
                      {item.status === "completed" ? "Completed" : "Cancelled"}
                    </Badge>
                  </div>
                  <div>
                    <div className={styles.cardTitle}>{item.selected_training_day_name}</div>
                    <div className={styles.cardMeta}>{item.routine_name}</div>
                  </div>
                  <div className={styles.textCompactMuted}>{countText(item)}</div>
                  {item.status === "completed" && (
                    <div className={styles.textCompactMuted}>
                      Workout duration: {formatDuration(item.duration_seconds)}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} aria-hidden="true" className={styles.chevron} />
              </Card>
            ))}
          </div>
        )}

        {items !== null && items.length > 0 && nextCursor != null && (
          <div className={styles.mt4}>
            <Button variant="primary" fullWidth onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
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
      </Page>
    </>
  );
}
