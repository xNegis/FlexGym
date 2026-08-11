import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRoutine, updateRoutine, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { Routine } from "../types";
import { OBJECTIVE_OPTIONS } from "../components/routineConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import { Field, TextInput, Select, TextArea } from "../ui/Field";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import styles from "./Screen.module.css";

export default function RoutineEditScreen() {
  const { routineId } = useParams<{ routineId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!routineId) return;
    const id = Number(routineId);
    if (!Number.isInteger(id) || id <= 0) {
      navigate("/plan", { replace: true });
      return;
    }
    setLoading(true);
    try {
      const result = await fetchRoutine(id);
      if ("notFound" in result) {
        navigate("/plan", { replace: true });
        return;
      }
      setRoutine(result);
      setName(result.name);
      setObjective(result.objective);
      setDescription(result.description ?? "");
      // No validation error text displayed here
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadError("Unable to load routine. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [routineId, navigate, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const canSubmit = name.trim().length > 0 && objective !== "" && !pending;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !routine) return;
    setError(null);
    setPending(true);
    try {
      const desc = description.trim();
      const result = await updateRoutine(routine.id, {
        name: name.trim(),
        objective,
        description: desc.length > 0 ? desc : null,
      });
      if ("detail" in result) {
        setError(result.detail);
      } else {
        navigate(`/plan/routines/${routine.id}`, { replace: true });
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <>
        <AppHeader title="Edit routine" showBack />
        <Page width="reading">
          <LoadingState label="Loading routine..." />
        </Page>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppHeader title="Edit routine" showBack />
        <Page width="reading">
          <Alert variant="error">
            <div className={styles.stack2}>
              <span>{loadError}</span>
              <Button variant="secondary" size="small" onClick={load}>
                Retry
              </Button>
            </div>
          </Alert>
        </Page>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Edit routine" showBack />
      <Page width="reading">
        <form onSubmit={handleSave} noValidate className={styles.stack5}>
          {error && <Alert variant="error">{error}</Alert>}

          <Field htmlFor="edit-routine-name" label="Name" required>
            <TextInput
              id="edit-routine-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="edit-routine-objective" label="Objective" required>
            <Select
              id="edit-routine-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              required
              disabled={pending}
            >
              {OBJECTIVE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="edit-routine-desc" label="Description" optional>
            <TextArea
              id="edit-routine-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              disabled={pending}
            />
          </Field>

          <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => navigate(`/plan/routines/${routine!.id}`)}
            disabled={pending}
          >
            Cancel
          </Button>
        </form>
      </Page>
    </>
  );
}
