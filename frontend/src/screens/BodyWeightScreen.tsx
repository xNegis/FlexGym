import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Scale } from "lucide-react";
import {
  deleteBodyWeightMeasurement,
  fetchBodyWeightChart,
  fetchBodyWeightMeasurements,
  saveBodyWeightMeasurement,
  UnauthenticatedError,
} from "../api";
import { useAuth } from "../context";
import type {
  BodyWeightChartPage,
  BodyWeightMeasurement,
  BodyWeightPage,
  ProgressPeriod,
} from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Dialog from "../ui/Dialog";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import SectionNav from "../ui/SectionNav";
import Section, { KeyValueList } from "../ui/Section";
import { Field, TextInput, TextArea } from "../ui/Field";
import BodyWeightChart from "../components/BodyWeightChart";
import styles from "./Screen.module.css";

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

function buildPeriodQuery(period: ProgressPeriod): string {
  return period === "3m" ? "" : `period=${period}`;
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

function formatLocalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatKg(value: number): string {
  return `${Number(value.toFixed(1))} kg`;
}

function formatChangeKg(value: number): string {
  if (value === 0) return "0.0 kg";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Number(Math.abs(value).toFixed(1))} kg`;
}

function isFiniteWeight(value: string): boolean {
  if (value.trim().length === 0) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 20 && parsed <= 500;
}

const PROGRESS_NAV_ITEMS = (active: string) => [
  { value: "workouts", label: "Workouts", to: "/progress/workouts", active: active === "workouts" },
  {
    value: "exercises",
    label: "Exercises",
    to: "/progress/exercises",
    active: active === "exercises",
  },
  {
    value: "statistics",
    label: "Statistics",
    to: "/progress/statistics",
    active: active === "statistics",
  },
  {
    value: "body-weight",
    label: "Body weight",
    to: "/progress/body-weight",
    active: active === "body-weight",
  },
];

export default function BodyWeightScreen() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = localToday();

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

  const [chart, setChart] = useState<BodyWeightChartPage | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const [page, setPage] = useState<BodyWeightPage | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null);
  const [dialogDate, setDialogDate] = useState(today);
  const [dialogWeight, setDialogWeight] = useState("");
  const [dialogNote, setDialogNote] = useState("");
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<BodyWeightMeasurement | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [saveSuccess, setSaveSuccess] = useState<{ date: string; photoCount: number } | null>(null);

  const chartRequestSequence = useRef(0);
  const historyRequestSequence = useRef(0);

  const loadChart = useCallback(
    async (clear: boolean) => {
      const requestId = ++chartRequestSequence.current;
      if (clear) {
        setChart(null);
      }
      setChartError(null);
      try {
        const result = await fetchBodyWeightChart(period, today);
        if (requestId !== chartRequestSequence.current) return;
        setChart(result);
        setChartError(null);
      } catch (err) {
        if (requestId !== chartRequestSequence.current) return;
        if (err instanceof UnauthenticatedError) {
          logout();
          return;
        }
        setChartError("Unable to load this chart. Please try again.");
      }
    },
    [period, today, logout],
  );

  const loadHistory = useCallback(
    async (clear: boolean) => {
      const requestId = ++historyRequestSequence.current;
      if (clear) {
        setPage(null);
        setLoadMoreError(null);
        setLoadingMore(false);
      }
      setHistoryError(null);
      try {
        const result = await fetchBodyWeightMeasurements({ period, localDate: today });
        if (requestId !== historyRequestSequence.current) return;
        setPage(result);
        setHistoryError(null);
      } catch (err) {
        if (requestId !== historyRequestSequence.current) return;
        if (err instanceof UnauthenticatedError) {
          logout();
          return;
        }
        setHistoryError("Unable to load body-weight history. Please try again.");
      }
    },
    [period, today, logout],
  );

  useEffect(() => {
    void loadChart(true);
    void loadHistory(true);
  }, [loadChart, loadHistory]);

  const loadMore = useCallback(async () => {
    if (page === null || loadingMore || page.next_cursor == null) return;
    const requestId = historyRequestSequence.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await fetchBodyWeightMeasurements({
        period,
        localDate: today,
        cursor: page.next_cursor,
      });
      if (requestId !== historyRequestSequence.current) return;
      setPage((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              items: [...prev.items, ...result.items],
              next_cursor: result.next_cursor,
            },
      );
    } catch (err) {
      if (requestId !== historyRequestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadMoreError("Unable to load more measurements. Please try again.");
    } finally {
      if (requestId === historyRequestSequence.current) {
        setLoadingMore(false);
      }
    }
  }, [page, loadingMore, period, today, logout]);

  const openAdd = () => {
    setDialogMode("add");
    setDialogDate(today);
    setDialogWeight("");
    setDialogNote("");
    setDialogError(null);
  };

  const openEdit = (item: BodyWeightMeasurement) => {
    setDialogMode("edit");
    setDialogDate(item.measurement_date);
    setDialogWeight(String(item.weight_kg));
    setDialogNote(item.note ?? "");
    setDialogError(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogDate(today);
    setDialogWeight("");
    setDialogNote("");
    setDialogError(null);
  };

  const handleDialogSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dialogMode === null || dialogPending || !isFiniteWeight(dialogWeight)) return;
    setDialogError(null);
    setDialogPending(true);
    try {
      const note = dialogNote.trim().length > 0 ? dialogNote.trim() : null;
      const result = await saveBodyWeightMeasurement(dialogDate, today, Number(dialogWeight), note);
      if ("detail" in result) {
        setDialogError(result.detail);
        return;
      }
      closeDialog();
      setSaveSuccess({ date: dialogDate, photoCount: result.result.item.photo_count });
      await loadChart(false);
      await loadHistory(false);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setDialogError("Unable to reach the server. Please try again.");
    } finally {
      setDialogPending(false);
    }
  };

  const openDelete = (item: BodyWeightMeasurement) => {
    setDeleteTarget(item);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (deleteTarget === null || deletePending) return;
    setDeleteError(null);
    setDeletePending(true);
    try {
      const result = await deleteBodyWeightMeasurement(deleteTarget.measurement_date);
      if (result !== null) {
        setDeleteError(result.detail);
        return;
      }
      setDeleteTarget(null);
      setSaveSuccess(null);
      await loadChart(false);
      await loadHistory(false);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setDeleteError("Unable to reach the server. Please try again.");
    } finally {
      setDeletePending(false);
    }
  };

  const currentWeight = page?.current_weight ?? null;
  const historyItems = page?.items ?? null;
  const chartLoaded = chart !== null && !chartError;
  const historyLoaded = page !== null && !historyError;

  const isGlobalEmpty =
    chartLoaded &&
    historyLoaded &&
    currentWeight !== null &&
    currentWeight.source === "profile_fallback" &&
    chart.items.length === 0;
  const isPeriodEmpty =
    chartLoaded &&
    historyLoaded &&
    currentWeight !== null &&
    currentWeight.source === "measurement" &&
    chart.items.length === 0 &&
    historyItems !== null &&
    historyItems.length === 0;

  const periodNavItems = PERIOD_VALUES.map((value) => ({
    value,
    label: PERIOD_LABELS[value],
    to: withQuery("/progress/body-weight", buildPeriodQuery(value)),
    active: period === value,
  }));

  const summaryItems: { label: string; value: string }[] = [];
  if (currentWeight !== null) {
    summaryItems.push({
      label: "Current body weight",
      value: formatKg(currentWeight.weight_kg),
    });
  }
  if (chart !== null) {
    if (chart.summary.change_kg !== null && chart.summary.previous !== null) {
      summaryItems.push({
        label: "Change since previous measurement",
        value: `${formatChangeKg(chart.summary.change_kg)} · previous ${formatLocalDate(chart.summary.previous.measurement_date)}`,
      });
    } else if (currentWeight !== null && currentWeight.source === "measurement") {
      summaryItems.push({
        label: "Change since previous measurement",
        value: "Unavailable",
      });
    }
  }

  const currentWeightSource =
    currentWeight !== null &&
    currentWeight.source === "measurement" &&
    currentWeight.measurement_date
      ? `Recorded on ${formatLocalDate(currentWeight.measurement_date)}`
      : "From your profile";

  return (
    <>
      <AppHeader title="Progress" />
      <Page width="reading">
        <p className={`${styles.textCompactMuted} ${styles.mb4}`}>
          Record your body weight and review how it changes over a selected period.
        </p>

        <div className={styles.mb4}>
          <SectionNav label="Progress sections" items={PROGRESS_NAV_ITEMS("body-weight")} />
        </div>

        <div className={styles.mb4}>
          <SectionNav label="Select time range" items={periodNavItems} />
        </div>

        <Section title="Body weight" className={styles.mb4}>
          <div className={styles.stack3}>
            {chartError && (
              <Alert variant="error">
                <div className={styles.stack2}>
                  <span>{chartError}</span>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => loadChart(chart === null)}
                  >
                    Retry
                  </Button>
                </div>
              </Alert>
            )}

            {!chartError && chart === null && <LoadingState label="Loading chart..." />}

            {isGlobalEmpty && (
              <EmptyState
                icon={<Scale size={32} />}
                title="No body-weight measurements yet"
                description="Record your first measurement to see your weight history."
                action={
                  <Button variant="primary" onClick={openAdd}>
                    Add measurement
                  </Button>
                }
              />
            )}

            {isPeriodEmpty && (
              <EmptyState
                icon={<Scale size={32} />}
                title="No measurements in this period"
                description="No body-weight measurements fall within the selected time range."
              />
            )}

            {chart !== null && chart.items.length > 0 && <BodyWeightChart points={chart.items} />}

            {summaryItems.length > 0 && (
              <>
                <KeyValueList items={summaryItems} />
                {currentWeight !== null && (
                  <p className={styles.textCompactMuted}>{currentWeightSource}</p>
                )}
              </>
            )}
          </div>
        </Section>

        {!isGlobalEmpty && (
          <div className={styles.mb4}>
            <Button variant="primary" fullWidth onClick={openAdd}>
              Add measurement
            </Button>
          </div>
        )}

        {saveSuccess && (
          <div className={styles.mb4}>
            <Alert variant="success">
              <div className={styles.stack2}>
                <span>Measurement for {formatLocalDate(saveSuccess.date)} saved.</span>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => navigate(`/progress/body-weight/${saveSuccess.date}/photos`)}
                >
                  <Camera size={16} aria-hidden="true" />
                  {saveSuccess.photoCount === 0 ? "Add photos" : "Manage photos"}
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {!isGlobalEmpty && (
          <Section title="History">
            <div className={styles.stack3}>
              {historyError && (
                <Alert variant="error">
                  <div className={styles.stack2}>
                    <span>{historyError}</span>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => loadHistory(page === null)}
                    >
                      Retry
                    </Button>
                  </div>
                </Alert>
              )}

              {!historyError && page === null && (
                <LoadingState label="Loading body-weight history..." />
              )}

              {page !== null && historyItems !== null && historyItems.length > 0 && (
                <div className={styles.stack3}>
                  <div className={styles.stack2}>
                    {historyItems.map((item) => (
                      <Card key={item.measurement_date}>
                        <div className={styles.stack2}>
                          <div className={styles.rowBetween}>
                            <span className={styles.textCaptionSubtle}>
                              {formatLocalDate(item.measurement_date)}
                            </span>
                            <span className={styles.cardTitle}>{formatKg(item.weight_kg)}</span>
                          </div>
                          {item.note && <div className={styles.textCompactMuted}>{item.note}</div>}
                          {item.photo_count > 0 && (
                            <span className={styles.textCaptionSubtle}>
                              {item.photo_count} photo{item.photo_count === 1 ? "" : "s"}
                            </span>
                          )}
                          <div className={styles.rowWrap2}>
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() =>
                                navigate(`/progress/body-weight/${item.measurement_date}/photos`)
                              }
                            >
                              <Camera size={16} aria-hidden="true" />
                              {item.photo_count === 0 ? "Add photos" : "Manage photos"}
                            </Button>
                            <Button variant="secondary" size="small" onClick={() => openEdit(item)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="small" onClick={() => openDelete(item)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {page !== null && page.next_cursor != null && (
                    <div>
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
                </div>
              )}

              {!historyError &&
                page !== null &&
                historyItems !== null &&
                historyItems.length === 0 && (
                  <p className={styles.textCompactMuted}>No measurements in this period.</p>
                )}
            </div>
          </Section>
        )}
      </Page>

      <Dialog
        open={dialogMode !== null}
        title={dialogMode === "edit" ? "Edit measurement" : "Add measurement"}
        onClose={dialogPending ? () => {} : closeDialog}
        actions={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={dialogPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="measurement-dialog-form"
              variant="primary"
              disabled={dialogPending || !isFiniteWeight(dialogWeight)}
            >
              {dialogPending ? "Saving…" : "Save measurement"}
            </Button>
          </>
        }
      >
        <form
          id="measurement-dialog-form"
          onSubmit={handleDialogSave}
          noValidate
          className={styles.stack4}
        >
          {dialogError && <Alert variant="error">{dialogError}</Alert>}
          {dialogMode === "edit" ? (
            <p className={styles.textCompactMuted}>
              Editing measurement for {formatLocalDate(dialogDate)}. The date cannot be changed.
            </p>
          ) : (
            <Field htmlFor="bw-dialog-date" label="Measurement date" required>
              <TextInput
                id="bw-dialog-date"
                type="date"
                value={dialogDate}
                onChange={(e) => setDialogDate(e.target.value)}
                max={today}
                required
                disabled={dialogPending}
              />
            </Field>
          )}
          <Field htmlFor="bw-dialog-weight" label="Body weight (kg)" required>
            <TextInput
              id="bw-dialog-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={20}
              max={500}
              value={dialogWeight}
              onChange={(e) => setDialogWeight(e.target.value)}
              required
              disabled={dialogPending}
            />
          </Field>
          <Field htmlFor="bw-dialog-note" label="Note" optional>
            <TextArea
              id="bw-dialog-note"
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              maxLength={1000}
              rows={2}
              disabled={dialogPending}
            />
          </Field>
          {dialogMode === "add" && (
            <p className={styles.textCompactMuted}>
              If you already recorded this date, saving will replace its weight and note.
            </p>
          )}
        </form>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        title="Delete measurement"
        onClose={deletePending ? () => {} : () => setDeleteTarget(null)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? "Deleting…" : "Delete measurement"}
            </Button>
          </>
        }
      >
        <p>
          Delete the measurement of {deleteTarget ? formatKg(deleteTarget.weight_kg) : ""} recorded
          on {deleteTarget ? formatLocalDate(deleteTarget.measurement_date) : ""}? This will be
          permanently removed
          {deleteTarget && deleteTarget.photo_count > 0
            ? `, along with its ${deleteTarget.photo_count} photo${deleteTarget.photo_count === 1 ? "" : "s"}`
            : ""}
          .
        </p>
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
      </Dialog>
    </>
  );
}
