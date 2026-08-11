import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchRoutine,
  fetchSchedule,
  fetchActiveRoutine,
  deleteRoutine,
  activateRoutine,
  deactivateRoutine,
  createTrainingDay,
  renameTrainingDay,
  deleteTrainingDay,
  moveTrainingDay,
  UnauthenticatedError,
} from "../api";
import { useAuth } from "../context";
import type { ActiveRoutine, Routine, ScheduleSlot } from "../types";
import { labelFor } from "../components/routineConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Section, { Divider, KeyValueList } from "../ui/Section";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import { Field, TextInput } from "../ui/Field";
import Dialog from "../ui/Dialog";
import { Move, Pencil, Plus, Trash2 } from "lucide-react";
import styles from "./Screen.module.css";

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const WEEKDAY_NAMES: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export default function RoutineDetailScreen() {
  const { routineId } = useParams<{ routineId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSlot[] | null>(null);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showActivate, setShowActivate] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showRename, setShowRename] = useState<number | null>(null);
  const [showDeleteDay, setShowDeleteDay] = useState<number | null>(null);
  const [showMove, setShowMove] = useState<number | null>(null);
  const [showAddDay, setShowAddDay] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newDayName, setNewDayName] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    if (!routineId) return;
    const id = Number(routineId);
    if (!Number.isInteger(id) || id <= 0) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [routineResult, scheduleResult, activeResult] = await Promise.all([
        fetchRoutine(id),
        fetchSchedule(id),
        fetchActiveRoutine(),
      ]);

      if ("notFound" in routineResult) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setRoutine(routineResult);
      setActiveRoutine(activeResult);

      if ("detail" in scheduleResult) {
        setError(scheduleResult.detail);
      } else {
        setSchedule(scheduleResult);
      }
    } catch (requestError) {
      if (requestError instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load routine. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [routineId, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const handleActivate = async () => {
    if (!routine) return;
    setActionError(null);
    setActionPending(true);
    try {
      const result = await activateRoutine(routine.id);
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setShowActivate(false);
        setRoutine(result.routine);
        setActiveRoutine(result);
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleSwitch = async () => {
    await handleActivate();
  };

  const handleDeactivate = async () => {
    setActionError(null);
    setActionPending(true);
    try {
      const result = await deactivateRoutine();
      if (result.detail !== null) {
        setActionError(result.detail);
      } else {
        setShowDeactivate(false);
        setRoutine((prev) => (prev ? { ...prev, is_active: false } : null));
        setActiveRoutine(null);
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleDelete = async () => {
    if (!routine) return;
    setActionError(null);
    setActionPending(true);
    try {
      const result = await deleteRoutine(routine.id);
      if (result !== null) {
        setActionError(result.detail);
      } else {
        navigate("/plan", { replace: true });
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleAddDay = async () => {
    if (!routine || !newDayName.trim()) return;
    setActionError(null);
    setActionPending(true);
    try {
      const result = await createTrainingDay(routine.id, newDayName.trim());
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setShowAddDay(false);
        setNewDayName("");
        setRoutine((prev) =>
          prev ? { ...prev, training_day_count: prev.training_day_count + 1 } : null,
        );
        await load();
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleRenameDay = async () => {
    if (!routine || showRename === null || !renameValue.trim()) return;
    setActionError(null);
    setActionPending(true);
    try {
      const result = await renameTrainingDay(routine.id, showRename, renameValue.trim());
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setShowRename(null);
        setRenameValue("");
        setSchedule((prev) =>
          prev
            ? prev.map((slot) =>
                slot.type === "training" && slot.training_day.id === showRename
                  ? { ...slot, training_day: { ...slot.training_day, name: renameValue.trim() } }
                  : slot,
              )
            : null,
        );
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleDeleteDay = async () => {
    if (!routine || showDeleteDay === null) return;
    setActionError(null);
    setActionPending(true);
    try {
      const result = await deleteTrainingDay(routine.id, showDeleteDay);
      if (result !== null) {
        setActionError(result.detail);
      } else {
        setShowDeleteDay(null);
        setRoutine((prev) =>
          prev ? { ...prev, training_day_count: Math.max(0, prev.training_day_count - 1) } : null,
        );
        await load();
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleMoveDay = async (targetPosition: number) => {
    if (!routine || showMove === null) return;
    const dayId = showMove;
    setActionError(null);
    setActionPending(true);
    try {
      const result = await moveTrainingDay(routine.id, dayId, targetPosition);
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setShowMove(null);
        setSchedule(result);
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  if (loading) {
    return (
      <>
        <AppHeader title="Routine" showBack onBack={() => navigate("/plan")} />
        <Page width="reading">
          <LoadingState label="Loading routine..." />
        </Page>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <AppHeader title="Routine not found" showBack onBack={() => navigate("/plan")} />
        <Page width="reading">
          <p className={`${styles.textBodyMuted} ${styles.mb4}`}>
            The routine you are looking for does not exist or is not accessible.
          </p>
          <Button variant="secondary" onClick={() => navigate("/plan")}>
            Back to routines
          </Button>
        </Page>
      </>
    );
  }

  if (!routine) return null;

  const hasTrainingDays = schedule
    ? schedule.some((s) => s.type === "training")
    : routine.training_day_count > 0;
  const isSwitch = activeRoutine !== null && activeRoutine.routine.id !== routine.id;
  const selectedDeleteDay =
    showDeleteDay === null
      ? null
      : schedule?.find(
          (slot) => slot.type === "training" && slot.training_day.id === showDeleteDay,
        );
  const isDeletingFinalActiveDay =
    routine.is_active &&
    schedule?.filter((slot) => slot.type === "training").length === 1 &&
    selectedDeleteDay?.type === "training";

  return (
    <>
      <AppHeader title={routine.name} showBack onBack={() => navigate("/plan")} />

      <Page width="planning">
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

        {actionError && (
          <div className={styles.mb4}>
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}

        <Section title="Overview">
          <KeyValueList
            items={[
              { label: "Objective", value: labelFor(routine.objective) },
              {
                label: "Sessions",
                value: `${routine.training_day_count} ${routine.training_day_count === 1 ? "session" : "sessions"}`,
              },
              {
                label: "Status",
                value: routine.is_active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="default">Not active</Badge>
                ),
              },
            ]}
          />
          {routine.description && (
            <div className={styles.mt3}>
              <p className={styles.textBodyMuted}>{routine.description}</p>
            </div>
          )}
        </Section>

        <Section title="Status">
          {!routine.is_active && (
            <div className={styles.stack3}>
              {!hasTrainingDays ? (
                <p className={styles.textCompactMuted}>
                  This routine needs at least one training day before it can be activated.
                </p>
              ) : (
                <Button
                  variant="primary"
                  onClick={isSwitch ? () => setShowActivate(true) : handleActivate}
                  disabled={actionPending}
                  fullWidth
                >
                  {isSwitch ? "Switch to this routine" : "Activate routine"}
                </Button>
              )}
            </div>
          )}
          {routine.is_active && (
            <div className={styles.stack3}>
              <p className={styles.textCompactMuted}>This is your active routine.</p>
              <Button variant="secondary" onClick={() => setShowDeactivate(true)} fullWidth>
                Deactivate routine
              </Button>
            </div>
          )}
        </Section>

        <Section title="Weekly schedule">
          {schedule === null && !error ? (
            <LoadingState label="Loading schedule..." />
          ) : schedule !== null ? (
            <div className={styles.stack2}>
              {schedule.map((slot) => (
                <Card key={slot.position} className={styles.cardRow}>
                  <div className={styles.row3}>
                    <span className={styles.weekday}>{WEEKDAY_LABELS[slot.weekday]}</span>

                    {slot.type === "rest" && <span className={styles.restText}>Rest</span>}

                    {slot.type === "training" && (
                      <div className={styles.flex1}>
                        <div className={styles.cardTitle}>{slot.training_day.name}</div>
                        <div className={styles.textCompactMuted}>
                          {slot.training_day.exercise_count}{" "}
                          {slot.training_day.exercise_count === 1 ? "exercise" : "exercises"}
                        </div>
                      </div>
                    )}

                    {slot.type === "training" && (
                      <div className={styles.scheduleActions}>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() =>
                            navigate(
                              `/plan/routines/${routine.id}/days/${slot.training_day.id}/exercises`,
                            )
                          }
                        >
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          title="Rename"
                          aria-label={`Rename ${slot.training_day.name}`}
                          onClick={() => {
                            setRenameValue(slot.training_day.name);
                            setShowRename(slot.training_day.id);
                          }}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          title="Move"
                          aria-label={`Move ${slot.training_day.name}`}
                          onClick={() => setShowMove(slot.training_day.id)}
                        >
                          <Move size={16} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          title={`Delete ${slot.training_day.name}`}
                          aria-label={`Delete ${slot.training_day.name}`}
                          onClick={() => setShowDeleteDay(slot.training_day.id)}
                          className={styles.dangerText}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : null}

          {routine.training_day_count < 7 && (
            <div className={styles.mt4}>
              <Button variant="secondary" onClick={() => setShowAddDay(true)} fullWidth>
                <Plus size={16} />
                Add training day
              </Button>
              <p className={`${styles.textCaptionSubtle} ${styles.mt2}`}>
                Training days are placed in the earliest available position.
              </p>
            </div>
          )}
        </Section>

        <Divider />

        <Section title="Routine settings">
          <div className={styles.stack3}>
            <Button
              variant="secondary"
              onClick={() => navigate(`/plan/routines/${routine.id}/edit`)}
              fullWidth
            >
              Edit routine
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowDelete(true)}
              fullWidth
              className={styles.dangerText}
            >
              Delete routine
            </Button>
          </div>
        </Section>
      </Page>

      <Dialog
        open={showActivate || false}
        title={isSwitch ? "Switch active routine" : "Activate routine"}
        onClose={actionPending ? () => {} : () => setShowActivate(false)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowActivate(false)}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={isSwitch ? handleSwitch : handleActivate}
              disabled={actionPending}
            >
              {actionPending ? "Activating..." : isSwitch ? "Switch to this routine" : "Activate"}
            </Button>
          </>
        }
      >
        <p>
          {isSwitch
            ? `Switch your active routine from "${activeRoutine?.routine.name}" to "${routine.name}"? "${routine.name}" will become the plan selected for future workouts. Neither routine will be deleted.`
            : `Are you sure you want to activate "${routine.name}"? It will become the plan selected for future workouts.`}
        </p>
        {actionError && <Alert variant="error">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={showDeactivate}
        title="Deactivate routine"
        onClose={actionPending ? () => {} : () => setShowDeactivate(false)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowDeactivate(false)}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeactivate} disabled={actionPending}>
              {actionPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </>
        }
      >
        <p>
          Deactivating "{routine.name}" removes your current active routine. The routine and all its
          days and exercises are preserved. Continue?
        </p>
        {actionError && <Alert variant="error">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={showDelete}
        title="Delete routine"
        onClose={actionPending ? () => {} : () => setShowDelete(false)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowDelete(false)}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={actionPending}>
              {actionPending ? "Deleting..." : "Delete routine"}
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete "{routine.name}"? This will permanently remove the
          routine, all training days, configured exercises, planned sets, and notes.
        </p>
        {routine.is_active && (
          <p>This routine is currently active. Deleting it will clear your active routine.</p>
        )}
        {actionError && <Alert variant="error">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={showRename !== null}
        title="Rename training day"
        onClose={
          actionPending
            ? () => {}
            : () => {
                setShowRename(null);
                setRenameValue("");
              }
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowRename(null);
                setRenameValue("");
              }}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRenameDay}
              disabled={actionPending || !renameValue.trim()}
            >
              {actionPending ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <Field htmlFor="rename-day" label="Training day name">
          <TextInput
            id="rename-day"
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={120}
            required
            disabled={actionPending}
          />
        </Field>
        {actionError && <Alert variant="error">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={showDeleteDay !== null}
        title="Delete training day"
        onClose={actionPending ? () => {} : () => setShowDeleteDay(null)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteDay(null)}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteDay} disabled={actionPending}>
              {actionPending ? "Deleting..." : "Delete training day"}
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete
          {selectedDeleteDay?.type === "training"
            ? ` "${selectedDeleteDay.training_day.name}" from ${WEEKDAY_NAMES[selectedDeleteDay.weekday]}`
            : " this training day"}
          ? All configured exercises and planned sets inside it will be permanently deleted. That
          weekday will become a rest day.
        </p>
        {isDeletingFinalActiveDay && (
          <p>
            This is the final training day in the active routine. Deleting it will also leave you
            with no active routine.
          </p>
        )}
        {actionError && <Alert variant="error">{actionError}</Alert>}
      </Dialog>

      <Dialog
        open={showMove !== null}
        title="Move training day"
        onClose={actionPending ? () => {} : () => setShowMove(null)}
        actions={
          <Button variant="secondary" onClick={() => setShowMove(null)} disabled={actionPending}>
            Cancel
          </Button>
        }
      >
        <p className={styles.mb3}>Select a new position:</p>
        <div className={styles.stack2}>
          {schedule?.map((slot) => {
            const isOccupied = slot.type === "training";
            const isSelf = isOccupied && slot.training_day.id === showMove;
            return (
              <Card
                key={slot.position}
                clickable
                onClick={() => !actionPending && !isSelf && handleMoveDay(slot.position)}
                className={`${styles.moveOption} ${isSelf ? styles.moveOptionCurrent : ""}`}
              >
                <div className={styles.rowBetween}>
                  <span>
                    {WEEKDAY_LABELS[slot.weekday]} —{" "}
                    {isOccupied ? `${slot.training_day.name}${isSelf ? " (current)" : ""}` : "Rest"}
                  </span>
                  {isOccupied && !isSelf && (
                    <span className={styles.textCaptionWarning}>Will swap positions</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        {actionError && (
          <div className={styles.mt3}>
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}
      </Dialog>

      <Dialog
        open={showAddDay}
        title="Add training day"
        onClose={
          actionPending
            ? () => {}
            : () => {
                setShowAddDay(false);
                setNewDayName("");
              }
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAddDay(false);
                setNewDayName("");
              }}
              disabled={actionPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddDay}
              disabled={actionPending || !newDayName.trim()}
            >
              {actionPending ? "Adding..." : "Add"}
            </Button>
          </>
        }
      >
        <Field htmlFor="new-day-name" label="Training day name" hint="e.g. Push, Pull, Legs">
          <TextInput
            id="new-day-name"
            type="text"
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
            maxLength={120}
            required
            disabled={actionPending}
          />
        </Field>
        {actionError && <Alert variant="error">{actionError}</Alert>}
      </Dialog>
    </>
  );
}
