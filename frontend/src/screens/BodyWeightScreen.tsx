import { useCallback, useEffect, useRef, useState } from "react";
import { Scale } from "lucide-react";
import {
  deleteBodyWeightMeasurement,
  fetchBodyWeightMeasurements,
  saveBodyWeightMeasurement,
  UnauthenticatedError,
} from "../api";
import { useAuth } from "../context";
import type { BodyWeightMeasurement, BodyWeightPage } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Dialog from "../ui/Dialog";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import SectionNav from "../ui/SectionNav";
import Section from "../ui/Section";
import { Field, TextInput, TextArea } from "../ui/Field";
import styles from "./Screen.module.css";

function localToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  const today = localToday();

  const [page, setPage] = useState<BodyWeightPage | null>(null);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [formDate, setFormDate] = useState(today);
  const [formWeight, setFormWeight] = useState("");
  const [formNote, setFormNote] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<BodyWeightMeasurement | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestSequence = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setPage(null);
    setInitialError(null);
    setLoadMoreError(null);
    try {
      const result = await fetchBodyWeightMeasurements();
      if (requestId !== requestSequence.current) return;
      setPage(result);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setInitialError("Unable to load body-weight history. Please try again.");
    }
  }, [logout]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (page === null || loadingMore || page.next_cursor == null) return;
    const requestId = requestSequence.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await fetchBodyWeightMeasurements({ cursor: page.next_cursor });
      if (requestId !== requestSequence.current) return;
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
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadMoreError("Unable to load more measurements. Please try again.");
    } finally {
      if (requestId === requestSequence.current) {
        setLoadingMore(false);
      }
    }
  }, [page, loadingMore, logout]);

  const resetForm = useCallback(() => {
    setFormDate(today);
    setFormWeight("");
    setFormNote("");
    setSaveError(null);
  }, [today]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savePending || !isFiniteWeight(formWeight)) return;
    setSaveError(null);
    setSavePending(true);
    try {
      const note = formNote.trim().length > 0 ? formNote.trim() : null;
      const result = await saveBodyWeightMeasurement(formDate, today, Number(formWeight), note);
      if ("detail" in result) {
        setSaveError(result.detail);
        return;
      }
      resetForm();
      await loadFirstPage();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setSaveError("Unable to reach the server. Please try again.");
    } finally {
      setSavePending(false);
    }
  };

  const beginEdit = (item: BodyWeightMeasurement) => {
    setEditingDate(item.measurement_date);
    setEditWeight(String(item.weight_kg));
    setEditNote(item.note ?? "");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingDate(null);
    setEditWeight("");
    setEditNote("");
    setEditError(null);
  };

  const handleEditSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingDate === null || editPending || !isFiniteWeight(editWeight)) return;
    setEditError(null);
    setEditPending(true);
    try {
      const note = editNote.trim().length > 0 ? editNote.trim() : null;
      const result = await saveBodyWeightMeasurement(editingDate, today, Number(editWeight), note);
      if ("detail" in result) {
        setEditError(result.detail);
        return;
      }
      cancelEdit();
      await loadFirstPage();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setEditError("Unable to reach the server. Please try again.");
    } finally {
      setEditPending(false);
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
      await loadFirstPage();
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

  const currentWeight = page?.current_weight;
  const items = page?.items ?? null;
  const showLoading = page === null && !initialError;
  const showEmpty = page !== null && items !== null && items.length === 0 && !initialError;

  return (
    <>
      <AppHeader title="Progress" />
      <Page width="reading">
        <p className={`${styles.textCompactMuted} ${styles.mb4}`}>
          Record your body weight as a dated history. The most recent measurement is your current
          body weight.
        </p>

        <div className={styles.mb4}>
          <SectionNav label="Progress sections" items={PROGRESS_NAV_ITEMS("body-weight")} />
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

        {currentWeight && (
          <Section title="Current body weight" className={styles.mb4}>
            <p className={styles.textBody}>{formatKg(currentWeight.weight_kg)}</p>
            <p className={styles.textCompactMuted}>
              {currentWeight.source === "measurement" && currentWeight.measurement_date
                ? `Recorded on ${formatLocalDate(currentWeight.measurement_date)}`
                : "From your profile"}
            </p>
          </Section>
        )}

        <Section title="Record a measurement" className={styles.mb4}>
          <form onSubmit={handleSave} noValidate className={styles.stack4}>
            {saveError && <Alert variant="error">{saveError}</Alert>}
            <Field htmlFor="bw-date" label="Measurement date" required>
              <TextInput
                id="bw-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                max={today}
                required
                disabled={savePending}
              />
            </Field>
            <Field htmlFor="bw-weight" label="Body weight (kg)" required>
              <TextInput
                id="bw-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={20}
                max={500}
                value={formWeight}
                onChange={(e) => setFormWeight(e.target.value)}
                required
                disabled={savePending}
              />
            </Field>
            <Field htmlFor="bw-note" label="Note" optional>
              <TextArea
                id="bw-note"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                maxLength={1000}
                rows={2}
                disabled={savePending}
              />
            </Field>
            <p className={styles.textCompactMuted}>
              If you already recorded this date, saving will replace its weight and note.
            </p>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={savePending || !isFiniteWeight(formWeight)}
            >
              {savePending ? "Saving…" : "Save measurement"}
            </Button>
          </form>
        </Section>

        {showLoading && <LoadingState label="Loading body-weight history..." />}

        {showEmpty && (
          <EmptyState
            icon={<Scale size={32} />}
            title="No body-weight measurements yet"
            description="Record your first measurement above to start your history."
          />
        )}

        {items !== null && items.length > 0 && (
          <Section title="History">
            <div className={styles.stack2}>
              {items.map((item) => (
                <Card key={item.measurement_date}>
                  <div className={styles.stack2}>
                    <div className={styles.rowBetween}>
                      <span className={styles.textCaptionSubtle}>
                        {formatLocalDate(item.measurement_date)}
                      </span>
                      <span className={styles.cardTitle}>{formatKg(item.weight_kg)}</span>
                    </div>
                    {item.note && <div className={styles.textCompactMuted}>{item.note}</div>}
                    {editingDate === item.measurement_date ? (
                      <form onSubmit={handleEditSave} noValidate className={styles.stack3}>
                        {editError && <Alert variant="error">{editError}</Alert>}
                        <Field
                          htmlFor={`bw-edit-weight-${item.measurement_date}`}
                          label="Body weight (kg)"
                          required
                        >
                          <TextInput
                            id={`bw-edit-weight-${item.measurement_date}`}
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={20}
                            max={500}
                            value={editWeight}
                            onChange={(e) => setEditWeight(e.target.value)}
                            required
                            disabled={editPending}
                          />
                        </Field>
                        <Field
                          htmlFor={`bw-edit-note-${item.measurement_date}`}
                          label="Note"
                          optional
                        >
                          <TextArea
                            id={`bw-edit-note-${item.measurement_date}`}
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            maxLength={1000}
                            rows={2}
                            disabled={editPending}
                          />
                        </Field>
                        <div className={styles.rowWrap2}>
                          <Button
                            type="submit"
                            variant="primary"
                            size="small"
                            disabled={editPending || !isFiniteWeight(editWeight)}
                          >
                            {editPending ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="small"
                            onClick={cancelEdit}
                            disabled={editPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className={styles.rowWrap2}>
                        <Button variant="secondary" size="small" onClick={() => beginEdit(item)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="small" onClick={() => openDelete(item)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {page !== null && page.next_cursor != null && (
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
          </Section>
        )}
      </Page>

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
          permanently removed.
        </p>
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
      </Dialog>
    </>
  );
}
