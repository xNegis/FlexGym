import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createRoutine,
  createTrainingDay,
  deleteRoutine,
  deleteTrainingDay,
  fetchRoutines,
  fetchRoutine,
  fetchTrainingDays,
  renameTrainingDay,
  reorderTrainingDays,
  UnauthenticatedError,
  updateRoutine,
} from "../api";
import type { Routine, TrainingDay } from "../types";
import { labelFor, OBJECTIVE_OPTIONS } from "./routineConstants";

interface Props {
  profileGoal: string;
  onUnauthenticated: () => void;
}

type ViewMode = "list" | "create" | "detail" | "edit" | "delete";

interface FormState {
  name: string;
  objective: string;
  description: string;
}

const EMPTY_FORM: FormState = { name: "", objective: "", description: "" };

function toFormState(routine: Routine): FormState {
  return {
    name: routine.name,
    objective: routine.objective,
    description: routine.description ?? "",
  };
}

function trainingDayCountLabel(count: number): string {
  if (count === 0) return "No training days";
  if (count === 1) return "1 training day";
  return `${count} training days`;
}

export default function RoutineManager({ profileGoal, onUnauthenticated }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestSequence = useRef(0);

  const loadRoutines = useCallback(async () => {
    const seq = ++requestSequence.current;
    setError(null);
    try {
      const data = await fetchRoutines();
      if (seq !== requestSequence.current) return;
      setRoutines(data);
    } catch (e) {
      if (seq !== requestSequence.current) return;
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to load routines");
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    if (viewMode === "list") {
      loadRoutines();
    }
  }, [viewMode, loadRoutines]);

  // Training day state
  const [trainingDays, setTrainingDays] = useState<TrainingDay[] | null>(null);
  const [trainingDaysLoading, setTrainingDaysLoading] = useState(false);
  const [trainingDayError, setTrainingDayError] = useState<string | null>(null);
  const [trainingDayFormName, setTrainingDayFormName] = useState("");
  const [renameDayId, setRenameDayId] = useState<number | null>(null);
  const [deleteDayId, setDeleteDayId] = useState<number | null>(null);
  const [reorderPending, setReorderPending] = useState(false);

  const loadTrainingDays = useCallback(async (routineId: number, silent: boolean = false) => {
    if (!silent) {
      setTrainingDaysLoading(true);
      setTrainingDayError(null);
    }
    try {
      const result = await fetchTrainingDays(routineId);
      if ("detail" in result) {
        if (result.detail === "Routine not found") {
          setSelectedId(null);
          setSelectedRoutine(null);
          setViewMode("list");
          return;
        }
        if (!silent) setTrainingDayError(result.detail);
      } else {
        setTrainingDays(result);
      }
    } catch {
      if (!silent) setTrainingDayError("Unable to load training days");
    } finally {
      if (!silent) setTrainingDaysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "detail" && selectedId !== null) {
      setTrainingDays(null);
      loadTrainingDays(selectedId);
    }
  }, [viewMode, selectedId, loadTrainingDays]);

  const refreshRoutineAndDays = useCallback(async () => {
    if (selectedId === null) return;
    const result = await fetchRoutine(selectedId);
    if ("notFound" in result) {
      setSelectedId(null);
      setSelectedRoutine(null);
      setViewMode("list");
      return;
    }
    setSelectedRoutine(result);
    loadTrainingDays(selectedId, true);
  }, [selectedId, loadTrainingDays]);

  // -- List view -------------------------------------------------------

  const handleCreate = () => {
    setForm({ ...EMPTY_FORM, objective: profileGoal });
    setError(null);
    setViewMode("create");
  };

  const handleOpenRoutine = (routine: Routine) => {
    setSelectedId(routine.id);
    setSelectedRoutine(routine);
    setError(null);
    setViewMode("detail");
  };

  // -- Create / Edit form ----------------------------------------------

  const canSubmit = form.name.trim().length > 0 && form.objective !== "" && !pending;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const payload = {
        name: form.name.trim(),
        objective: form.objective,
        description: form.description.trim() || null,
      };

      let result;
      if (viewMode === "create") {
        result = await createRoutine(payload);
      } else if (selectedId !== null) {
        result = await updateRoutine(selectedId, payload);
      } else {
        return;
      }

      if ("detail" in result) {
        setError(result.detail);
      } else {
        if (viewMode === "create") {
          setSelectedId(result.id);
          setSelectedRoutine(result);
          setViewMode("detail");
        } else {
          setSelectedRoutine(result);
          setViewMode("detail");
        }
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const cancelForm = () => {
    if (viewMode === "edit") {
      setError(null);
      setViewMode("detail");
    } else {
      setError(null);
      setViewMode("list");
    }
  };

  const enterEdit = () => {
    if (!selectedRoutine) return;
    setForm(toFormState(selectedRoutine));
    setError(null);
    setViewMode("edit");
  };

  // -- Delete confirmation ---------------------------------------------

  const enterDelete = () => {
    setError(null);
    setViewMode("delete");
  };

  const cancelDelete = () => {
    setError(null);
    setViewMode("detail");
  };

  const handleDelete = async () => {
    if (selectedId === null) return;
    setError(null);
    setPending(true);
    try {
      const result = await deleteRoutine(selectedId);
      if (result !== null) {
        if (result.detail === "Routine not found") {
          setSelectedId(null);
          setSelectedRoutine(null);
          setViewMode("list");
          return;
        }
        setError(result.detail);
      } else {
        setSelectedId(null);
        setSelectedRoutine(null);
        setViewMode("list");
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const backToList = () => {
    setViewMode("list");
    setSelectedId(null);
    setSelectedRoutine(null);
    setError(null);
  };

  // -- Training day actions --------------------------------------------

  const canAddDay = (trainingDays?.length ?? 0) < 7 && !pending && !reorderPending;

  const handleAddTrainingDay = async (e: FormEvent) => {
    e.preventDefault();
    const name = trainingDayFormName.trim();
    if (!name || !canAddDay || selectedId === null) return;
    setTrainingDayError(null);
    setPending(true);
    try {
      const result = await createTrainingDay(selectedId, name);
      if ("detail" in result) {
        setTrainingDayError(result.detail);
      } else {
        setTrainingDayFormName("");
        refreshRoutineAndDays();
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setTrainingDayError("Unable to save training day");
    } finally {
      setPending(false);
    }
  };

  const startRename = (day: TrainingDay) => {
    setRenameDayId(day.id);
    setTrainingDayFormName(day.name);
    setTrainingDayError(null);
  };

  const cancelRename = () => {
    setRenameDayId(null);
    setTrainingDayFormName("");
    setTrainingDayError(null);
  };

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const name = trainingDayFormName.trim();
    if (!name || selectedId === null || renameDayId === null || pending) return;
    setTrainingDayError(null);
    setPending(true);
    try {
      const result = await renameTrainingDay(selectedId, renameDayId, name);
      if ("detail" in result) {
        setTrainingDayError(result.detail);
      } else {
        setRenameDayId(null);
        setTrainingDayFormName("");
        refreshRoutineAndDays();
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setTrainingDayError("Unable to rename training day");
    } finally {
      setPending(false);
    }
  };

  const handleMoveUp = async (day: TrainingDay) => {
    if (!trainingDays || trainingDays.length < 2 || reorderPending || selectedId === null) return;
    const index = trainingDays.findIndex((d) => d.id === day.id);
    if (index <= 0) return;
    const newOrder = [...trainingDays];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    await submitReorder(newOrder.map((d) => d.id));
  };

  const handleMoveDown = async (day: TrainingDay) => {
    if (!trainingDays || trainingDays.length < 2 || reorderPending || selectedId === null) return;
    const index = trainingDays.findIndex((d) => d.id === day.id);
    if (index < 0 || index >= trainingDays.length - 1) return;
    const newOrder = [...trainingDays];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    await submitReorder(newOrder.map((d) => d.id));
  };

  const submitReorder = async (dayIds: number[]) => {
    if (selectedId === null) return;
    const previous = trainingDays;
    setTrainingDays((current) => {
      if (!current) return current;
      const sorted = dayIds
        .map((id) => current.find((d) => d.id === id))
        .filter((d): d is TrainingDay => d !== undefined);
      return sorted.map((d, i) => ({ ...d, position: i + 1 }));
    });
    setReorderPending(true);
    setTrainingDayError(null);
    try {
      const result = await reorderTrainingDays(selectedId, dayIds);
      if ("detail" in result) {
        setTrainingDays(previous);
        setTrainingDayError(result.detail);
      } else {
        setTrainingDays(result);
        setTrainingDayError(null);
      }
    } catch {
      setTrainingDays(previous);
      setTrainingDayError("Unable to reorder training days");
    } finally {
      setReorderPending(false);
    }
  };

  const startDeleteDay = (day: TrainingDay) => {
    setDeleteDayId(day.id);
    setTrainingDayError(null);
  };

  const cancelDeleteDay = () => {
    setDeleteDayId(null);
    setTrainingDayError(null);
  };

  const handleDeleteDay = async () => {
    if (selectedId === null || deleteDayId === null) return;
    setTrainingDayError(null);
    setPending(true);
    try {
      const result = await deleteTrainingDay(selectedId, deleteDayId);
      if (result !== null) {
        if (result.detail === "Training day not found") {
          setDeleteDayId(null);
          refreshRoutineAndDays();
          return;
        }
        setTrainingDayError(result.detail);
      } else {
        setDeleteDayId(null);
        refreshRoutineAndDays();
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setTrainingDayError("Unable to delete training day");
    } finally {
      setPending(false);
    }
  };

  // -- Render: List view -----------------------------------------------

  if (viewMode === "list") {
    if (routines === null && !error) {
      return (
        <div className="routine-section" role="status">
          <p className="routine-loading">Loading routines...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="routine-section">
          <div className="routine-error" role="alert">
            <p>{error}</p>
            <button type="button" className="routine-retry-button" onClick={loadRoutines}>
              Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="routine-section">
        <div className="routine-list-header">
          <h2 className="routine-heading">Routines</h2>
          <button type="button" className="routine-create-button" onClick={handleCreate}>
            Create routine
          </button>
        </div>

        {routines!.length === 0 ? (
          <div className="routine-empty">
            <p>You have no routines yet.</p>
            <p className="routine-empty-hint">
              Create a routine to start building your training plan.
            </p>
          </div>
        ) : (
          <ul className="routine-list">
            {routines!.map((r) => (
              <li key={r.id} className="routine-item">
                <button
                  type="button"
                  className="routine-item-button"
                  onClick={() => handleOpenRoutine(r)}
                >
                  <div className="routine-item-content">
                    <span className="routine-item-name">{r.name}</span>
                    <div className="routine-item-meta">
                      <span className="routine-item-objective">{labelFor(r.objective)}</span>
                      <span className="routine-item-count">
                        {trainingDayCountLabel(r.training_day_count)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // -- Render: Create / Edit form --------------------------------------

  if (viewMode === "create" || viewMode === "edit") {
    return (
      <form className="routine-form" onSubmit={handleSave} noValidate>
        <h2 className="routine-form-heading">
          {viewMode === "create" ? "Create routine" : "Edit routine"}
        </h2>

        {error && (
          <div className="routine-form-error" role="alert">
            {error}
          </div>
        )}

        <label className="auth-field">
          <span>Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={120}
            required
            disabled={pending}
            autoFocus
          />
        </label>

        <label className="auth-field">
          <span>Objective</span>
          <select
            value={form.objective}
            onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
            required
            disabled={pending}
          >
            {OBJECTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="auth-field">
          <span>Description (optional)</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            maxLength={1000}
            rows={3}
            disabled={pending}
          />
        </label>

        <button type="submit" className="auth-button" disabled={!canSubmit}>
          {pending ? "Saving..." : viewMode === "create" ? "Create" : "Save"}
        </button>
        <button type="button" className="auth-cancel" onClick={cancelForm} disabled={pending}>
          Cancel
        </button>
      </form>
    );
  }

  // -- Render: Detail view ---------------------------------------------

  if (viewMode === "detail") {
    // Training day delete confirmation sub-view
    if (deleteDayId !== null && selectedRoutine) {
      const day = trainingDays?.find((d) => d.id === deleteDayId);
      return (
        <div className="routine-detail">
          <h2 className="routine-detail-heading">{selectedRoutine.name}</h2>
          <h3 className="routine-form-heading">Delete training day</h3>

          <div className="delete-confirmation">
            <p>
              Are you sure you want to delete <strong>{day?.name}</strong>? This action is permanent
              and cannot be undone.
            </p>
          </div>

          {trainingDayError && (
            <div className="routine-detail-error" role="alert">
              {trainingDayError}
            </div>
          )}

          <button
            type="button"
            className="auth-delete-confirm-button"
            onClick={handleDeleteDay}
            disabled={pending}
          >
            {pending ? "Deleting..." : "Delete training day"}
          </button>
          <button
            type="button"
            className="auth-cancel"
            onClick={cancelDeleteDay}
            disabled={pending}
          >
            Cancel
          </button>
        </div>
      );
    }

    if (!selectedRoutine) {
      return (
        <div className="routine-section">
          <p className="routine-not-found">Routine not found</p>
          <button type="button" className="routine-back-button" onClick={backToList}>
            Back to routines
          </button>
        </div>
      );
    }

    const atLimit = (trainingDays?.length ?? 0) >= 7;

    return (
      <div className="routine-detail">
        <h2 className="routine-detail-heading">{selectedRoutine.name}</h2>
        <div className="routine-detail-section">
          <div className="routine-detail-row">
            <span className="routine-detail-label">Objective</span>
            <span className="routine-detail-value">{labelFor(selectedRoutine.objective)}</span>
          </div>
          <div className="routine-detail-row">
            <span className="routine-detail-label">Description</span>
            <span className="routine-detail-value">
              {selectedRoutine.description ?? "No description provided"}
            </span>
          </div>
        </div>

        {error && (
          <div className="routine-detail-error" role="alert">
            {error}
          </div>
        )}

        <div className="routine-detail-actions">
          <button type="button" className="auth-button" onClick={enterEdit}>
            Edit routine
          </button>
          <button type="button" className="auth-delete-button" onClick={enterDelete}>
            Delete routine
          </button>
          <button type="button" className="auth-cancel" onClick={backToList}>
            Back to routines
          </button>
        </div>

        <div className="training-days-section">
          <h3 className="training-days-heading">Training days</h3>
          <p className="training-days-hint">
            Training days are workout sessions inside this routine. Their weekly placement will be
            configured in a later scheduling step.
          </p>

          {trainingDayError && (
            <div className="routine-detail-error" role="alert">
              {trainingDayError}
            </div>
          )}

          {trainingDaysLoading ? (
            <div className="routine-loading" role="status">
              Loading training days...
            </div>
          ) : trainingDays === null ? null : trainingDays.length === 0 ? (
            <div className="training-days-empty">
              <p>No training days yet.</p>
              <p className="routine-empty-hint">Add a training day to define a workout session.</p>
            </div>
          ) : (
            <ul className="training-days-list">
              {trainingDays.map((day) => (
                <li key={day.id} className="training-day-item">
                  {renameDayId === day.id ? (
                    <form className="training-day-rename" onSubmit={handleRename} noValidate>
                      <input
                        type="text"
                        className="training-day-rename-input"
                        value={trainingDayFormName}
                        onChange={(e) => setTrainingDayFormName(e.target.value)}
                        maxLength={120}
                        required
                        disabled={pending}
                        autoFocus
                      />
                      <div className="training-day-rename-actions">
                        <button
                          type="submit"
                          className="training-day-action-button"
                          disabled={!trainingDayFormName.trim() || pending}
                        >
                          {pending ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="training-day-cancel-button"
                          onClick={cancelRename}
                          disabled={pending}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="training-day-row">
                      <span className="training-day-position">{day.position}.</span>
                      <span className="training-day-name">{day.name}</span>
                      <div className="training-day-controls">
                        <button
                          type="button"
                          className="training-day-move-button"
                          onClick={() => handleMoveUp(day)}
                          disabled={day.position === 1 || reorderPending || pending}
                          aria-label={`Move ${day.name} up`}
                        >
                          &#9650;
                        </button>
                        <button
                          type="button"
                          className="training-day-move-button"
                          onClick={() => handleMoveDown(day)}
                          disabled={
                            day.position === (trainingDays?.length ?? 0) ||
                            reorderPending ||
                            pending
                          }
                          aria-label={`Move ${day.name} down`}
                        >
                          &#9660;
                        </button>
                        <button
                          type="button"
                          className="training-day-action-button"
                          onClick={() => startRename(day)}
                          disabled={reorderPending || pending}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="training-day-delete-button"
                          onClick={() => startDeleteDay(day)}
                          disabled={reorderPending || pending}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {atLimit ? (
            <p className="training-days-limit-message">
              This routine has the maximum of 7 training days. Delete an existing day to add a new
              one.
            </p>
          ) : (
            <form className="training-day-add" onSubmit={handleAddTrainingDay} noValidate>
              <input
                type="text"
                className="training-day-add-input"
                value={trainingDayFormName}
                onChange={(e) => setTrainingDayFormName(e.target.value)}
                maxLength={120}
                placeholder="Day name (e.g. Push)"
                required
                disabled={!canAddDay || renameDayId !== null}
              />
              <button
                type="submit"
                className="training-day-add-button"
                disabled={!trainingDayFormName.trim() || !canAddDay || renameDayId !== null}
              >
                {pending ? "Adding..." : "Add training day"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // -- Render: Delete routine confirmation -----------------------------

  if (viewMode === "delete") {
    return (
      <div className="routine-detail">
        <h2 className="routine-form-heading">Delete routine</h2>

        <div className="delete-confirmation">
          <p>
            Are you sure you want to delete <strong>{selectedRoutine?.name}</strong>?
            {selectedRoutine && selectedRoutine.training_day_count > 0 && (
              <>
                {" "}
                All {selectedRoutine.training_day_count} training days will also be permanently
                deleted.
              </>
            )}{" "}
            This action is permanent and cannot be undone.
          </p>
        </div>

        {error && (
          <div className="routine-detail-error" role="alert">
            {error}
          </div>
        )}

        <button
          type="button"
          className="auth-delete-confirm-button"
          onClick={handleDelete}
          disabled={pending}
        >
          {pending ? "Deleting..." : "Delete routine"}
        </button>
        <button type="button" className="auth-cancel" onClick={cancelDelete} disabled={pending}>
          Cancel
        </button>
      </div>
    );
  }

  return null;
}
