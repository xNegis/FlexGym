import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createRoutine,
  deleteRoutine,
  fetchRoutines,
  UnauthenticatedError,
  updateRoutine,
} from "../api";
import type { Routine } from "../types";
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
    } catch {
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
    } catch {
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
                  <span className="routine-item-name">{r.name}</span>
                  <span className="routine-item-objective">{labelFor(r.objective)}</span>
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
      </div>
    );
  }

  // -- Render: Delete confirmation -------------------------------------

  return (
    <div className="routine-detail">
      <h2 className="routine-form-heading">Delete routine</h2>

      <div className="delete-confirmation">
        <p>
          Are you sure you want to delete <strong>{selectedRoutine?.name}</strong>? This action is
          permanent and cannot be undone.
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
