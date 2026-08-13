import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { fetchWorkoutStatistics, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type {
  ProgressPeriod,
  WorkoutStatistics,
  WorkoutStatisticsActivityDay,
  WorkoutStatisticsWeek,
} from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import SectionNav from "../ui/SectionNav";
import Section, { KeyValueList } from "../ui/Section";
import SegmentedControl from "../ui/SegmentedControl";
import styles from "./Screen.module.css";
import statisticsStyles from "./Statistics.module.css";

const PERIOD_VALUES: ProgressPeriod[] = ["1m", "3m", "6m", "1y", "all"];

const PERIOD_LABELS: Record<ProgressPeriod, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  all: "All",
};

const REASON_LABELS: Record<string, string> = {
  not_enough_time: "Not enough time",
  too_fatigued: "Too fatigued",
  equipment_unavailable: "Equipment unavailable",
  unable_to_perform: "Unable to perform",
  pain_or_discomfort: "Pain or discomfort",
  other: "Other",
};

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type WorkMetric = "sets" | "time";

function localToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildPeriodQuery(period: ProgressPeriod): string {
  return period === "3m" ? "" : `period=${period}`;
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseLocalDate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function formatLocalDate(iso: string): string {
  const { year, month, day } = parseLocalDate(iso);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(iso: string): string {
  const { year, month, day } = parseLocalDate(iso);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

interface WeeklyBarsProps {
  weeks: WorkoutStatisticsWeek[];
  mode: "workouts" | "work";
  workMetric: WorkMetric;
}

function WeeklyBars({ weeks, mode, workMetric }: WeeklyBarsProps) {
  let max = 1;
  if (mode === "workouts") {
    max = Math.max(
      1,
      ...weeks.map((week) => week.completed_workout_count + week.cancelled_workout_count),
    );
  } else {
    max = Math.max(
      1,
      ...weeks.map((week) =>
        workMetric === "sets" ? week.performed_set_count : week.total_elapsed_seconds,
      ),
    );
  }

  const labelStep = Math.max(1, Math.ceil(weeks.length / 10));

  return (
    <div className={statisticsStyles.weeklyChart} aria-hidden="true">
      {weeks.map((week, index) => {
        const showLabel =
          weeks.length <= 20 || index % labelStep === 0 || index === weeks.length - 1;
        const barLabel = showLabel ? formatShortDate(week.week_start_local_date) : "";

        if (mode === "workouts") {
          const completedPct = (week.completed_workout_count / max) * 100;
          const cancelledPct = (week.cancelled_workout_count / max) * 100;
          return (
            <div key={week.week_start_local_date} className={statisticsStyles.weekColumn}>
              <div className={statisticsStyles.barTrack}>
                <div
                  className={statisticsStyles.barSegmentCancelled}
                  style={{ height: `${cancelledPct}%` }}
                />
                <div
                  className={statisticsStyles.barSegmentCompleted}
                  style={{ height: `${completedPct}%` }}
                />
              </div>
              <span className={statisticsStyles.barLabel}>{barLabel}</span>
            </div>
          );
        }

        const value = workMetric === "sets" ? week.performed_set_count : week.total_elapsed_seconds;
        const valuePct = (value / max) * 100;
        return (
          <div key={week.week_start_local_date} className={statisticsStyles.weekColumn}>
            <div className={statisticsStyles.barTrack}>
              <div className={statisticsStyles.barSegmentWork} style={{ height: `${valuePct}%` }} />
            </div>
            <span className={statisticsStyles.barLabel}>{barLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

interface ActivityCalendarProps {
  activityDays: WorkoutStatisticsActivityDay[];
  fromLocalDate: string | null;
  throughLocalDate: string;
}

function ActivityCalendar({
  activityDays,
  fromLocalDate,
  throughLocalDate,
}: ActivityCalendarProps) {
  const byDate = new Map<string, WorkoutStatisticsActivityDay>(
    activityDays.map((day) => [day.local_date, day]),
  );

  let calendarStart = fromLocalDate;
  if (calendarStart === null) {
    calendarStart = activityDays.length > 0 ? `${activityDays[0].local_date.slice(0, 7)}-01` : null;
  }

  const months: { label: string; days: string[] }[] = [];
  if (calendarStart !== null) {
    let current = calendarStart;
    while (current <= throughLocalDate) {
      const { year, month } = parseLocalDate(current);
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const days: string[] = [];
      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = `${year}-${pad2(month)}-${pad2(day)}`;
        if (date >= calendarStart && date <= throughLocalDate) {
          days.push(date);
        }
      }
      months.push({ label: `${MONTH_NAMES[month - 1]} ${year}`, days });

      const next = new Date(Date.UTC(year, month, 1));
      current = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-01`;
    }
  }

  return (
    <div>
      <div className={statisticsStyles.calendarGridWrap} aria-hidden="true">
        {months.map((month) => (
          <div key={month.label} className={statisticsStyles.calendarMonth}>
            <div className={statisticsStyles.calendarMonthTitle}>{month.label}</div>
            <div className={statisticsStyles.calendarWeekdays}>
              {WEEKDAY_HEADERS.map((weekday) => (
                <span key={weekday} className={statisticsStyles.calendarWeekday}>
                  {weekday}
                </span>
              ))}
            </div>
            <div className={statisticsStyles.calendarGrid}>
              {month.days.map((date, index) => {
                const { year, month: monthNumber, day } = parseLocalDate(date);
                const activity = byDate.get(date);
                const isActive = activity !== undefined;
                const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
                const mondayBasedColumn = ((weekday + 6) % 7) + 1;
                return (
                  <div
                    key={date}
                    className={`${statisticsStyles.calendarDay} ${
                      isActive ? statisticsStyles.calendarDayActive : ""
                    }`}
                    style={index === 0 ? { gridColumnStart: mondayBasedColumn } : undefined}
                  >
                    <span className={statisticsStyles.calendarDayNumber}>{day}</span>
                    {isActive && (
                      <span className={statisticsStyles.calendarDayCount}>
                        {activity.completed_workout_count + activity.cancelled_workout_count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <ol className={statisticsStyles.activityDayList}>
        {activityDays.map((day) => {
          const total = day.completed_workout_count + day.cancelled_workout_count;
          return (
            <li key={day.local_date} className={statisticsStyles.activityDayItem}>
              {formatLocalDate(day.local_date)} — {pluralize(total, "workout", "workouts")}:{" "}
              {day.completed_workout_count} completed, {day.cancelled_workout_count} cancelled
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function StatisticsScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();

  const localDate = localToday();

  const periodValues = searchParams.getAll("period");
  const rawPeriod = periodValues.length === 1 ? periodValues[0] : null;
  const period: ProgressPeriod = PERIOD_VALUES.includes(rawPeriod as ProgressPeriod)
    ? (rawPeriod as ProgressPeriod)
    : "3m";

  const canonicalQuery = buildPeriodQuery(period);

  useEffect(() => {
    if (searchParams.toString() !== canonicalQuery) {
      setSearchParams(canonicalQuery, { replace: true });
    }
  }, [searchParams, canonicalQuery, setSearchParams]);

  const [data, setData] = useState<WorkoutStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workMetric, setWorkMetric] = useState<WorkMetric>("sets");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setData(null);
    setError(null);
    try {
      const result = await fetchWorkoutStatistics(period, localDate);
      if (requestId !== requestSequence.current) return;
      setData(result);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load workout statistics. Please try again.");
    }
  }, [period, localDate, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const progressNavItems = [
    { value: "workouts", label: "Workouts", to: "/progress/workouts", active: false },
    { value: "exercises", label: "Exercises", to: "/progress/exercises", active: false },
    { value: "statistics", label: "Statistics", to: "/progress/statistics", active: true },
  ];

  const periodNavItems = PERIOD_VALUES.map((value) => ({
    value,
    label: PERIOD_LABELS[value],
    to: withQuery("/progress/statistics", buildPeriodQuery(value)),
    active: period === value,
  }));

  const showLoading = data === null && !error;
  const isEmpty = data !== null && !error && data.summary.terminal_workout_count === 0;

  const ratioText =
    data !== null && data.summary.completion_ratio_percent !== null
      ? `${data.summary.completion_ratio_percent.toFixed(2)}% (${data.summary.completed_workout_count} of ${data.summary.terminal_workout_count})`
      : "Unavailable";

  const workMetricOptions: { value: WorkMetric; label: string }[] = [
    { value: "sets", label: "Performed sets" },
    { value: "time", label: "Elapsed time" },
  ];

  return (
    <>
      <AppHeader title="Progress" />
      <Page width="reading">
        <p className={`${styles.textCompactMuted} ${styles.mb4}`}>
          Review recorded workout outcomes, performed and skipped work, elapsed session time, and
          weekly activity over a selected period.
        </p>

        <div className={styles.mb4}>
          <SectionNav label="Progress sections" items={progressNavItems} />
        </div>

        <div className={styles.mb4}>
          <SectionNav label="Select time range" items={periodNavItems} />
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

        {showLoading && <LoadingState label="Loading workout statistics..." />}

        {isEmpty && (
          <EmptyState
            icon={<BarChart3 size={32} />}
            title="No recorded workouts in this period"
            description="Completed and cancelled workouts appear here after they are finished."
            action={
              period !== "all" ? (
                <Button
                  variant="primary"
                  onClick={() => navigate(withQuery("/progress/statistics", "period=all"))}
                >
                  View all activity
                </Button>
              ) : undefined
            }
          />
        )}

        {data !== null && !error && !isEmpty && (
          <div className={styles.stack5}>
            <Section title="Period summary">
              <KeyValueList
                items={[
                  { label: "Completed workouts", value: data.summary.completed_workout_count },
                  { label: "Cancelled workouts", value: data.summary.cancelled_workout_count },
                  { label: "Terminal workouts", value: data.summary.terminal_workout_count },
                  { label: "Completion ratio", value: ratioText },
                  { label: "Performed sets", value: data.summary.performed_set_count },
                  { label: "Skipped sets", value: data.summary.skipped_set_count },
                  { label: "Skipped exercises", value: data.summary.skipped_exercise_count },
                  {
                    label: "Recorded elapsed session time",
                    value: formatDuration(data.summary.total_elapsed_seconds),
                  },
                ]}
              />
              <p className={`${styles.textCompactMuted} ${styles.mt3}`}>
                Completion ratio is the share of started terminal workouts in this period that were
                completed. It is not a measure of plan adherence.
              </p>
              <p className={styles.textCompactMuted}>
                Recorded elapsed session time is wall-clock time from workout start to completion or
                cancellation, not time under tension.
              </p>
            </Section>

            <Section title="Weekly workouts">
              <p className={styles.textCompactMuted}>
                The first and last weeks may include only days inside the selected period.
              </p>
              <div className={statisticsStyles.legend}>
                <span className={statisticsStyles.legendItem}>
                  <span
                    className={`${statisticsStyles.legendSwatch} ${statisticsStyles.legendSwatchCompleted}`}
                  />
                  Completed
                </span>
                <span className={statisticsStyles.legendItem}>
                  <span
                    className={`${statisticsStyles.legendSwatch} ${statisticsStyles.legendSwatchCancelled}`}
                  />
                  Cancelled
                </span>
              </div>
              <WeeklyBars weeks={data.weeks} mode="workouts" workMetric={workMetric} />
              <table className={statisticsStyles.weeklyTable}>
                <caption className={statisticsStyles.visuallyHidden}>
                  Weekly completed and cancelled workouts
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Completed</th>
                    <th scope="col">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((week) => (
                    <tr key={week.week_start_local_date}>
                      <th scope="row">
                        {formatShortDate(week.week_start_local_date)} –{" "}
                        {formatShortDate(week.week_end_local_date)}
                      </th>
                      <td>{week.completed_workout_count}</td>
                      <td>{week.cancelled_workout_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Weekly recorded work">
              <p className={styles.textCompactMuted}>
                The first and last weeks may include only days inside the selected period.
              </p>
              <SegmentedControl
                name="work-metric"
                label="Choose weekly recorded-work metric"
                value={workMetric}
                options={workMetricOptions}
                onChange={setWorkMetric}
              />
              <WeeklyBars weeks={data.weeks} mode="work" workMetric={workMetric} />
              <table className={statisticsStyles.weeklyTable}>
                <caption className={statisticsStyles.visuallyHidden}>Weekly recorded work</caption>
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Performed sets</th>
                    <th scope="col">Elapsed time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((week) => (
                    <tr key={week.week_start_local_date}>
                      <th scope="row">
                        {formatShortDate(week.week_start_local_date)} –{" "}
                        {formatShortDate(week.week_end_local_date)}
                      </th>
                      <td>{week.performed_set_count}</td>
                      <td>{formatDuration(week.total_elapsed_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Skip reasons">
              {data.skip_reasons.length === 0 ? (
                <p className={styles.textCompactMuted}>No recorded skips in this period.</p>
              ) : (
                <ul className={statisticsStyles.skipReasonList}>
                  {data.skip_reasons.map((reason) => {
                    const label =
                      reason.reason_code === null
                        ? "No reason provided"
                        : (REASON_LABELS[reason.reason_code] ?? reason.reason_code);
                    const counts = [
                      reason.set_skip_action_count > 0
                        ? pluralize(
                            reason.set_skip_action_count,
                            "set skip action",
                            "set skip actions",
                          )
                        : null,
                      reason.exercise_skip_action_count > 0
                        ? pluralize(
                            reason.exercise_skip_action_count,
                            "exercise skip action",
                            "exercise skip actions",
                          )
                        : null,
                    ]
                      .filter((part): part is string => part !== null)
                      .join(", ");
                    return (
                      <li
                        key={reason.reason_code ?? "none"}
                        className={statisticsStyles.skipReasonRow}
                      >
                        <span className={statisticsStyles.skipReasonLabel}>{label}</span>
                        <span className={statisticsStyles.skipReasonCounts}>{counts}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title="Activity calendar">
              <p className={styles.textCompactMuted}>
                Days without a marker had no recorded terminal workout.
              </p>
              <ActivityCalendar
                activityDays={data.activity_days}
                fromLocalDate={data.range.from_local_date}
                throughLocalDate={data.range.through_local_date}
              />
            </Section>
          </div>
        )}
      </Page>
    </>
  );
}
