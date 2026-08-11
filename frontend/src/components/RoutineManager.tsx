import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  activateRoutine,
  createRoutine,
  createTrainingDay,
  deactivateRoutine,
  deleteRoutine,
  deleteTrainingDay,
  fetchRoutines,
  fetchRoutine,
  fetchSchedule,
  moveTrainingDay,
  renameTrainingDay,
  UnauthenticatedError,
  updateRoutine,
} from "../api";
import type { Routine, ScheduleSlot, ScheduleTrainingSlot, TrainingDay } from "../types";
import ExerciseConfiguration from "./ExerciseConfiguration";
import { labelFor, OBJECTIVE_OPTIONS } from "./routineConstants";

interface Props {
  profileGoal: string;
  onUnauthenticated: () => void;
}

type ViewMode =
  | "list"
  | "create"
  | "detail"
  | "edit"
  | "delete"
  | "activateConfirm"
  | "deactivateConfirm"
  | "configExercises";

interface FormState {
  name: string;
  objective: string;
  description: string;
}

const EMPTY_FORM: FormState = { name: "", objective: "", description: "" };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

function exerciseCountLabel(count: number): string {
  if (count === 0) return "No exercises";
  if (count === 1) return "1 exercise";
  return `${count} exercises`;
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
  const [configDay, setConfigDay] = useState<TrainingDay | null>(null);

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

  // Schedule state
  const [schedule, setSchedule] = useState<ScheduleSlot[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [trainingDayFormName, setTrainingDayFormName] = useState("");
  const [renameDayId, setRenameDayId] = useState<number | null>(null);
  const [deleteDayId, setDeleteDayId] = useState<number | null>(null);
  const [movePending, setMovePending] = useState(false);
  const scheduleRequestSequence = useRef(0);

  const loadSchedule = useCallback(
    async (routineId: number, silent: boolean = false) => {
      const seq = ++scheduleRequestSequence.current;
      if (!silent) {
        setScheduleLoading(true);
        setScheduleError(null);
      }
      try {
        const result = await fetchSchedule(routineId);
        if (seq !== scheduleRequestSequence.current) return;
        if ("detail" in result) {
          if (result.detail === "Routine not found") {
            setSelectedId(null);
            setSelectedRoutine(null);
            setViewMode("list");
            return;
          }
          setScheduleError(result.detail);
        } else {
          setSchedule(result);
        }
      } catch (e) {
        if (seq !== scheduleRequestSequence.current) return;
        if (e instanceof UnauthenticatedError) {
          onUnauthenticated();
          return;
        }
        setScheduleError("Unable to load schedule");
      } finally {
        if (seq === scheduleRequestSequence.current) setScheduleLoading(false);
      }
    },
    [onUnauthenticated],
  );

  useEffect(() => {
    if (viewMode === "detail" && selectedId !== null) {
      setSchedule(null);
      loadSchedule(selectedId);
    }
  }, [viewMode, selectedId, loadSchedule]);

  const refreshRoutineAndSchedule = useCallback(async () => {
    if (selectedId === null) return;
    try {
      const result = await fetchRoutine(selectedId);
      if ("notFound" in result) {
        setSelectedId(null);
        setSelectedRoutine(null);
        setViewMode("list");
        return;
      }
      setSelectedRoutine(result);
      await loadSchedule(selectedId, true);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setScheduleError("Unable to refresh routine");
    }
  }, [selectedId, loadSchedule, onUnauthenticated]);

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

  // -- Activation / deactivation ---------------------------------------

  const [activationPending, setActivationPending] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const getActiveRoutine = (): Routine | undefined => {
    if (!routines) return undefined;
    return routines.find((r) => r.is_active);
  };

  const enterActivateConfirm = () => {
    setActivationError(null);
    setViewMode("activateConfirm");
  };

  const cancelActivate = () => {
    setActivationError(null);
    setViewMode("detail");
  };

  const handleActivate = async () => {
    if (selectedId === null) return;
    setActivationError(null);
    setActivationPending(true);
    try {
      const result = await activateRoutine(selectedId);
      if ("detail" in result) {
        setActivationError(result.detail);
      } else {
        setViewMode("detail");
        await loadRoutines();
        if (result.routine) {
          setSelectedRoutine(result.routine);
        }
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setActivationError("Unable to activate routine");
    } finally {
      setActivationPending(false);
    }
  };

  const enterDeactivateConfirm = () => {
    setActivationError(null);
    setViewMode("deactivateConfirm");
  };

  const cancelDeactivate = () => {
    setActivationError(null);
    setViewMode("detail");
  };

  const handleDeactivate = async () => {
    setActivationError(null);
    setActivationPending(true);
    try {
      const result = await deactivateRoutine();
      if (result.detail) {
        setActivationError(result.detail);
      } else {
        setViewMode("detail");
        await loadRoutines();
        if (selectedId && selectedRoutine) {
          setSelectedRoutine({ ...selectedRoutine, is_active: false });
        }
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setActivationError("Unable to deactivate routine");
    } finally {
      setActivationPending(false);
    }
  };

  // -- Training day actions --------------------------------------------

  const canAddDay = (() => {
    if (!schedule) return false;
    const trainingCount = schedule.filter((s) => s.type === "training").length;
    return trainingCount < 7 && !pending && !movePending;
  })();

  const handleAddTrainingDay = async (e: FormEvent) => {
    e.preventDefault();
    const name = trainingDayFormName.trim();
    if (!name || !canAddDay || selectedId === null) return;
    setScheduleError(null);
    setPending(true);
    try {
      const result = await createTrainingDay(selectedId, name);
      if ("detail" in result) {
        setScheduleError(result.detail);
      } else {
        setTrainingDayFormName("");
        await refreshRoutineAndSchedule();
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setScheduleError("Unable to save training day");
    } finally {
      setPending(false);
    }
  };

  const startRename = (slot: ScheduleTrainingSlot) => {
    setRenameDayId(slot.training_day.id);
    setTrainingDayFormName(slot.training_day.name);
    setScheduleError(null);
  };

  const cancelRename = () => {
    setRenameDayId(null);
    setTrainingDayFormName("");
    setScheduleError(null);
  };

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const name = trainingDayFormName.trim();
    if (!name || selectedId === null || renameDayId === null || pending) return;
    setScheduleError(null);
    setPending(true);
    try {
      const result = await renameTrainingDay(selectedId, renameDayId, name);
      if ("detail" in result) {
        setScheduleError(result.detail);
      } else {
        setRenameDayId(null);
        setTrainingDayFormName("");
        await refreshRoutineAndSchedule();
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setScheduleError("Unable to rename training day");
    } finally {
      setPending(false);
    }
  };

  const handleMove = async (dayId: number, targetPosition: number) => {
    if (selectedId === null || movePending || pending) return;
    const previous = schedule;
    setMovePending(true);
    setScheduleError(null);
    try {
      const result = await moveTrainingDay(selectedId, dayId, targetPosition);
      if ("detail" in result) {
        setSchedule(previous);
        setScheduleError(result.detail);
      } else {
        setSchedule(result);
        await refreshRoutineAndSchedule();
      }
    } catch {
      setSchedule(previous);
      setScheduleError("Unable to move training day");
    } finally {
      setMovePending(false);
    }
  };

  const startDeleteDay = (slot: ScheduleTrainingSlot) => {
    setDeleteDayId(slot.training_day.id);
    setScheduleError(null);
  };

  const cancelDeleteDay = () => {
    setDeleteDayId(null);
    setScheduleError(null);
  };

  const handleDeleteDay = async () => {
    if (selectedId === null || deleteDayId === null) return;
    setScheduleError(null);
    setPending(true);
    try {
      const result = await deleteTrainingDay(selectedId, deleteDayId);
      if (result !== null) {
        if (result.detail === "Training day not found") {
          setDeleteDayId(null);
          await refreshRoutineAndSchedule();
          return;
        }
        setScheduleError(result.detail);
      } else {
        setDeleteDayId(null);
        await refreshRoutineAndSchedule();
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setScheduleError("Unable to delete training day");
    } finally {
      setPending(false);
    }
  };

  // -- Exercise configuration ------------------------------------------

  const openConfigExercises = (slot: ScheduleTrainingSlot) => {
    setConfigDay({
      id: slot.training_day.id,
      name: slot.training_day.name,
      week_position: slot.training_day.week_position,
      exercise_count: slot.training_day.exercise_count,
      created_at: slot.training_day.created_at,
      updated_at: slot.training_day.updated_at,
    });
    setViewMode("configExercises");
  };

  const closeConfigExercises = () => {
    setConfigDay(null);
    setViewMode("detail");
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
          <>
            {!getActiveRoutine() && routines!.some((r) => r.training_day_count >= 1) && (
              <p className="routine-no-active-message">
                No routine is currently selected as your active training plan.
              </p>
            )}
            <ul className="routine-list">
              {routines!.map((r) => (
                <li key={r.id} className="routine-item">
                  <button
                    type="button"
                    className="routine-item-button"
                    onClick={() => handleOpenRoutine(r)}
                  >
                    <div className="routine-item-content">
                      <span className="routine-item-name">
                        {r.name}
                        {r.is_active && (
                          <span className="routine-active-badge" aria-label="Active">
                            Active
                          </span>
                        )}
                      </span>
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
          </>
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
    if (deleteDayId !== null && selectedRoutine && schedule) {
      const slot = schedule.find(
        (s) => s.type === "training" && s.training_day.id === deleteDayId,
      ) as ScheduleTrainingSlot | undefined;
      return (
        <div className="routine-detail">
          <h2 className="routine-detail-heading">{selectedRoutine.name}</h2>
          <h3 className="routine-form-heading">Delete training day</h3>

          <div className="delete-confirmation">
            <p>
              Are you sure you want to delete <strong>{slot?.training_day.name}</strong> from{" "}
              <strong>{slot ? WEEKDAYS[slot.position - 1] : "unknown weekday"}</strong>? All
              configured exercises and planned sets inside it will also be permanently deleted. That
              weekday will become a rest day.
              {selectedRoutine.is_active &&
                schedule.filter((s) => s.type === "training").length === 1 && (
                  <>
                    {" "}
                    This will also deactivate <strong>{selectedRoutine.name}</strong> since it will
                    have no remaining training days.
                  </>
                )}{" "}
              This action is permanent and cannot be undone.
            </p>
          </div>

          {scheduleError && (
            <div className="routine-detail-error" role="alert">
              {scheduleError}
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

    const atLimit = schedule ? schedule.filter((s) => s.type === "training").length >= 7 : false;

    const trainingCount = schedule ? schedule.filter((s) => s.type === "training").length : 0;
    const canActivate = trainingCount >= 1;
    const thisIsActive = selectedRoutine.is_active;
    const otherIsActive = !thisIsActive && !!getActiveRoutine();

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
          <div className="routine-detail-row">
            <span className="routine-detail-label">Status</span>
            <span className="routine-detail-value">{thisIsActive ? "Active" : "Not active"}</span>
          </div>
        </div>

        {error && (
          <div className="routine-detail-error" role="alert">
            {error}
          </div>
        )}
        {activationError && (
          <div className="routine-detail-error" role="alert">
            {activationError}
          </div>
        )}

        <div className="routine-detail-actions">
          {thisIsActive ? (
            <button
              type="button"
              className="auth-delete-button"
              onClick={enterDeactivateConfirm}
              disabled={activationPending || pending}
            >
              Deactivate routine
            </button>
          ) : otherIsActive ? (
            <button
              type="button"
              className="auth-button"
              onClick={enterActivateConfirm}
              disabled={!canActivate || activationPending || pending}
              title={!canActivate ? "Add at least one training day to activate this routine" : ""}
            >
              {activationPending ? "Switching..." : "Switch to this routine"}
            </button>
          ) : (
            <button
              type="button"
              className="auth-button"
              onClick={handleActivate}
              disabled={!canActivate || activationPending || pending}
              title={!canActivate ? "Add at least one training day to activate this routine" : ""}
            >
              {activationPending ? "Activating..." : "Activate routine"}
            </button>
          )}

          {!canActivate && !thisIsActive && (
            <p className="routine-activation-hint">
              At least one training day is required before this routine can be activated.
            </p>
          )}

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
          <h3 className="training-days-heading">Weekly schedule</h3>
          <p className="training-days-hint">
            Each weekday is either a training session or a rest day. New sessions are automatically
            placed in the earliest available weekday.
          </p>

          {scheduleError && (
            <div className="routine-detail-error" role="alert">
              {scheduleError}
            </div>
          )}

          {scheduleLoading ? (
            <div className="routine-loading" role="status">
              Loading schedule...
            </div>
          ) : schedule === null ? null : (
            <ul className="schedule-list">
              {schedule.map((slot) => (
                <li key={slot.position} className="schedule-slot">
                  <div className="schedule-slot-header">
                    <span className="schedule-weekday">{WEEKDAYS[slot.position - 1]}</span>
                    {slot.type === "training" ? (
                      <span className="schedule-slot-type schedule-slot-training">Training</span>
                    ) : (
                      <span className="schedule-slot-type schedule-slot-rest">Rest</span>
                    )}
                  </div>

                  {slot.type === "training" ? (
                    <>
                      {renameDayId === slot.training_day.id ? (
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
                        <div className="schedule-training-day">
                          <div className="schedule-training-day-info">
                            <span className="schedule-training-day-name">
                              {slot.training_day.name}
                            </span>
                            <span className="schedule-exercise-count">
                              {exerciseCountLabel(slot.training_day.exercise_count)}
                            </span>
                          </div>
                          <div className="schedule-training-day-move">
                            <label className="schedule-move-label">
                              <span className="schedule-move-label-text">Move to:</span>
                              <select
                                className="schedule-move-select"
                                value={slot.position}
                                onChange={(e) => {
                                  const newPos = parseInt(e.target.value, 10);
                                  if (newPos !== slot.position) {
                                    handleMove(slot.training_day.id, newPos);
                                  }
                                }}
                                disabled={movePending || pending || renameDayId !== null}
                              >
                                {WEEKDAYS.map((day, i) => {
                                  const pos = i + 1;
                                  const isTargetOccupied =
                                    pos !== slot.position &&
                                    schedule?.some(
                                      (s) => s.type === "training" && s.position === pos,
                                    );
                                  const label = isTargetOccupied
                                    ? `${day} (swap)`
                                    : pos === slot.position
                                      ? `${day} (current)`
                                      : day;
                                  return (
                                    <option key={pos} value={pos}>
                                      {label}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>
                          </div>
                          <div className="schedule-training-day-actions">
                            <button
                              type="button"
                              className="training-day-config-button"
                              onClick={() => openConfigExercises(slot)}
                              disabled={movePending || pending || renameDayId !== null}
                            >
                              Exercises
                            </button>
                            <button
                              type="button"
                              className="training-day-action-button"
                              onClick={() => startRename(slot)}
                              disabled={movePending || pending}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="training-day-delete-button"
                              onClick={() => startDeleteDay(slot)}
                              disabled={movePending || pending}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="schedule-rest-day">
                      <span className="schedule-rest-text">No training session scheduled.</span>
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
    const isActive = selectedRoutine?.is_active ?? false;
    return (
      <div className="routine-detail">
        <h2 className="routine-form-heading">Delete routine</h2>

        <div className="delete-confirmation">
          <p>
            Are you sure you want to delete <strong>{selectedRoutine?.name}</strong>?
            {selectedRoutine && selectedRoutine.training_day_count > 0 && (
              <>
                {" "}
                All {selectedRoutine.training_day_count} training days, their configured exercises,
                and planned sets will also be permanently deleted.
              </>
            )}
            {isActive && (
              <> Deleting this routine will also leave you with no active training plan.</>
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

  // -- Render: Activate / Switch confirmation ---------------------------

  if (viewMode === "activateConfirm") {
    const active = getActiveRoutine();
    return (
      <div className="routine-detail">
        <h2 className="routine-form-heading">Switch active routine</h2>

        <div className="delete-confirmation">
          <p>
            Are you sure you want to switch your active routine from{" "}
            <strong>{active?.name ?? "unknown"}</strong> to <strong>{selectedRoutine?.name}</strong>
            ?
          </p>
          <p>
            <strong>{selectedRoutine?.name}</strong> will become your plan for future workouts. Your
            routines and their contents will not be deleted.
          </p>
        </div>

        {activationError && (
          <div className="routine-detail-error" role="alert">
            {activationError}
          </div>
        )}

        <button
          type="button"
          className="auth-button"
          onClick={handleActivate}
          disabled={activationPending || pending}
        >
          {activationPending ? "Switching..." : `Switch routine`}
        </button>
        <button
          type="button"
          className="auth-cancel"
          onClick={cancelActivate}
          disabled={activationPending || pending}
        >
          Cancel
        </button>
      </div>
    );
  }

  // -- Render: Deactivate confirmation ----------------------------------

  if (viewMode === "deactivateConfirm") {
    return (
      <div className="routine-detail">
        <h2 className="routine-form-heading">Deactivate routine</h2>

        <div className="delete-confirmation">
          <p>
            Are you sure you want to deactivate <strong>{selectedRoutine?.name}</strong>? No routine
            will be selected for future workouts. The routine and its contents will not be deleted.
          </p>
        </div>

        {activationError && (
          <div className="routine-detail-error" role="alert">
            {activationError}
          </div>
        )}

        <button
          type="button"
          className="auth-delete-confirm-button"
          onClick={handleDeactivate}
          disabled={activationPending || pending}
        >
          {activationPending ? "Deactivating..." : "Deactivate routine"}
        </button>
        <button
          type="button"
          className="auth-cancel"
          onClick={cancelDeactivate}
          disabled={activationPending || pending}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (
    viewMode === "configExercises" &&
    selectedId !== null &&
    configDay !== null &&
    selectedRoutine
  ) {
    return (
      <ExerciseConfiguration
        routineId={selectedId}
        trainingDay={configDay}
        routineName={selectedRoutine.name}
        onUnauthenticated={onUnauthenticated}
        onBack={closeConfigExercises}
      />
    );
  }

  return null;
}
