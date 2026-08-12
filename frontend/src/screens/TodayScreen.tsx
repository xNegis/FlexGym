import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Dumbbell, Play } from "lucide-react";
import {
  createWorkout,
  fetchStartContext,
  UnauthenticatedError,
  type CreateWorkoutResult,
} from "../api";
import { useAuth } from "../context";
import type { ActiveWorkoutSummary, SessionPreview, StartContext } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import Dialog from "../ui/Dialog";
import styles from "./Screen.module.css";

function localToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayLabel(weekPosition: number): string {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days[weekPosition - 1] ?? "";
}

export default function TodayScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [context, setContext] = useState<StartContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<SessionPreview | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [resumeWorkout, setResumeWorkout] = useState<ActiveWorkoutSummary | null>(null);

  const localDate = localToday();

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchStartContext(localDate);
      if ("detail" in result) {
        setError(result.detail);
        setContext(null);
        setSelectedPreview(null);
        setResumeWorkout(null);
      } else {
        setContext(result);
        setSelectedPreview(null);
        setStartError(null);
        if (result.state === "active_workout") {
          setResumeWorkout(result.workout);
        } else {
          setResumeWorkout(null);
        }
        if (result.state === "scheduled_session") {
          setSelectedPreview(result.session);
        }
      }
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load today's context. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [localDate, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStart = async () => {
    if (!selectedPreview || !selectedPreview.can_start) return;
    setStarting(true);
    setStartError(null);
    try {
      const result: CreateWorkoutResult = await createWorkout(selectedPreview.id, localDate);
      if ("detail" in result) {
        if (result.active_workout) {
          setResumeWorkout(result.active_workout);
          setContext(null);
          setSelectedPreview(null);
          setStartError("You already have a workout in progress.");
        } else {
          setStartError(result.detail);
        }
      } else {
        navigate(`/workouts/${result.id}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setStartError("Unable to start workout. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <AppHeader title="Today" />
      <Page width="reading">
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

        {loading && <LoadingState label="Loading today's session..." />}

        {!loading && !error && resumeWorkout && (
          <div className={styles.stack5}>
            <Card active>
              <div className={styles.stack3}>
                <div className={`${styles.rowBetween} ${styles.stack2}`}>
                  <Badge variant="accent">In progress</Badge>
                </div>
                <div>
                  <div className={styles.textCompactMuted}>{resumeWorkout.routine_name}</div>
                  <div className={styles.cardTitle}>{resumeWorkout.selected_training_day_name}</div>
                  <div className={styles.textCompactMuted}>
                    {resumeWorkout.local_date} —{" "}
                    {new Date(resumeWorkout.started_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => navigate(`/workouts/${resumeWorkout.id}`)}
                >
                  <Play size={18} aria-hidden="true" /> Resume workout
                </Button>
              </div>
            </Card>
          </div>
        )}

        {!loading && !error && !resumeWorkout && context?.state === "no_active_routine" && (
          <EmptyState
            icon={<Dumbbell size={32} />}
            title="No active routine"
            description="Activate a training routine to see your planned session for today."
            action={
              <Button variant="primary" onClick={() => navigate("/plan")}>
                Go to Plan
              </Button>
            }
          />
        )}

        {!loading &&
          !error &&
          !resumeWorkout &&
          context &&
          context.state === "scheduled_session" &&
          !selectedPreview && (
            <div className={styles.stack5}>
              <Card>
                <div className={styles.stack3}>
                  <div>
                    <div className={styles.textCompactMuted}>{context.routine.routine_name}</div>
                    <div className={styles.cardTitle}>{context.session.name}</div>
                    <div className={styles.textCompactMuted}>
                      {weekdayLabel(context.session.week_position)} —{" "}
                      {context.session.exercise_count}{" "}
                      {context.session.exercise_count === 1 ? "exercise" : "exercises"} &middot;{" "}
                      {context.session.set_count} {context.session.set_count === 1 ? "set" : "sets"}
                    </div>
                  </div>
                  {context.session.can_start ? (
                    <>
                      <div className={styles.stack2}>
                        {context.session.exercises.map((ex) => (
                          <div key={ex.position} className={styles.rowBetween}>
                            <div className={styles.row2}>
                              <span className={styles.textCaptionSubtle}>{ex.position}.</span>
                              <span>{ex.name}</span>
                            </div>
                            <span className={styles.textCompactMuted}>
                              {ex.set_count} {ex.set_count === 1 ? "set" : "sets"}
                            </span>
                          </div>
                        ))}
                      </div>
                      {startError && <Alert variant="error">{startError}</Alert>}
                      <Button variant="primary" fullWidth onClick={handleStart} disabled={starting}>
                        <Play size={18} aria-hidden="true" />{" "}
                        {starting ? "Starting..." : "Start workout"}
                      </Button>
                      <Button variant="ghost" fullWidth onClick={() => setSelectorOpen(true)}>
                        Choose another session
                      </Button>
                    </>
                  ) : (
                    <>
                      <Alert variant="info">
                        This session has no configured exercises and cannot be started.
                      </Alert>
                      <div className={styles.stack2}>
                        {context.session_previews.some((s) => s.can_start) ? (
                          <Button
                            variant="primary"
                            fullWidth
                            onClick={() =>
                              navigate(
                                `/plan/routines/${context.routine.routine_id}/days/${context.session.id}/exercises`,
                              )
                            }
                          >
                            Configure session
                          </Button>
                        ) : (
                          <Button variant="primary" fullWidth onClick={() => navigate("/plan")}>
                            Configure routine
                          </Button>
                        )}
                        {context.session_previews.some((s) => s.can_start) && (
                          <Button
                            variant="secondary"
                            fullWidth
                            onClick={() => setSelectorOpen(true)}
                          >
                            Choose another session
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>
          )}

        {!loading && !error && !resumeWorkout && context && context.state === "rest_day" && (
          <div className={styles.stack5}>
            <Card>
              <div className={styles.stack3}>
                <div>
                  <div className={styles.textCompactMuted}>{context.routine.routine_name}</div>
                  <div className={styles.cardTitle}>Rest day</div>
                  <div className={styles.textCompactMuted}>
                    {weekdayLabel(context.week_position)}
                  </div>
                </div>
                {context.session_previews.some((s) => s.can_start) ? (
                  <Button variant="secondary" fullWidth onClick={() => setSelectorOpen(true)}>
                    Choose another session
                  </Button>
                ) : (
                  <Button variant="primary" fullWidth onClick={() => navigate("/plan")}>
                    Configure routine
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}

        {selectedPreview &&
          !resumeWorkout &&
          context &&
          (context.state === "scheduled_session" || context.state === "rest_day") && (
            <div className={styles.stack5}>
              <Card active>
                <div className={styles.stack3}>
                  <div className={styles.rowBetween}>
                    <Badge>Selected</Badge>
                    {context.state === "scheduled_session" &&
                      selectedPreview.id !== context.session.id && (
                        <span className={styles.textCaptionMuted}>
                          Scheduled: {context.session.name}
                        </span>
                      )}
                    {context.state === "rest_day" && (
                      <span className={styles.textCaptionMuted}>Scheduled: Rest</span>
                    )}
                  </div>
                  <div>
                    {context.state === "scheduled_session" &&
                      selectedPreview.id === context.session.id && (
                        <div className={styles.textCompactMuted}>Scheduled session</div>
                      )}
                    <div className={styles.cardTitle}>{selectedPreview.name}</div>
                    <div className={styles.textCompactMuted}>
                      {weekdayLabel(selectedPreview.week_position)} —{" "}
                      {selectedPreview.exercise_count}{" "}
                      {selectedPreview.exercise_count === 1 ? "exercise" : "exercises"} &middot;{" "}
                      {selectedPreview.set_count} {selectedPreview.set_count === 1 ? "set" : "sets"}
                    </div>
                  </div>
                  <div className={styles.stack2}>
                    {selectedPreview.exercises.map((ex) => (
                      <div key={ex.position} className={styles.rowBetween}>
                        <div className={styles.row2}>
                          <span className={styles.textCaptionSubtle}>{ex.position}.</span>
                          <span>{ex.name}</span>
                        </div>
                        <span className={styles.textCompactMuted}>
                          {ex.set_count} {ex.set_count === 1 ? "set" : "sets"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {startError && <Alert variant="error">{startError}</Alert>}
                  <Button variant="primary" fullWidth onClick={handleStart} disabled={starting}>
                    <Play size={18} aria-hidden="true" />{" "}
                    {starting ? "Starting..." : "Start workout"}
                  </Button>
                  <Button variant="ghost" fullWidth onClick={() => setSelectorOpen(true)}>
                    Change session
                  </Button>
                </div>
              </Card>
            </div>
          )}
      </Page>

      {selectorOpen &&
        context &&
        (context.state === "scheduled_session" || context.state === "rest_day") && (
          <SessionSelector
            previews={context.session_previews}
            selectedId={selectedPreview?.id ?? null}
            onSelect={(preview) => {
              setSelectedPreview(preview);
              setStartError(null);
              setSelectorOpen(false);
            }}
            onClose={() => setSelectorOpen(false)}
          />
        )}
    </>
  );
}

function SessionSelector({
  previews,
  selectedId,
  onSelect,
  onClose,
}: {
  previews: SessionPreview[];
  selectedId: number | null;
  onSelect: (preview: SessionPreview) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open title="Change session" onClose={onClose}>
      <div className={styles.stack3}>
        {previews.map((preview) => (
          <Card
            key={preview.id}
            clickable={preview.can_start}
            active={preview.id === selectedId}
            onClick={() => {
              if (preview.can_start) onSelect(preview);
            }}
          >
            <div className={styles.stack2}>
              <div className={styles.rowBetween}>
                <div>
                  <div className={styles.cardTitle}>{preview.name}</div>
                  <div className={styles.textCompactMuted}>
                    {weekdayLabel(preview.week_position)}
                  </div>
                </div>
                {preview.can_start ? (
                  <ChevronRight size={18} className={styles.textCaptionSubtle} aria-hidden="true" />
                ) : (
                  <Badge>No exercises</Badge>
                )}
              </div>
              {preview.can_start ? (
                <div className={styles.textCompactMuted}>
                  {preview.exercise_count} {preview.exercise_count === 1 ? "exercise" : "exercises"}{" "}
                  &middot; {preview.set_count} {preview.set_count === 1 ? "set" : "sets"}
                  {preview.exercise_count > 0 && (
                    <span className={styles.textCaptionSubtle}>
                      {" "}
                      — {preview.exercises.map((e) => e.name).join(", ")}
                    </span>
                  )}
                </div>
              ) : (
                <div className={styles.textCaptionMuted}>Configure exercises before starting</div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Dialog>
  );
}
