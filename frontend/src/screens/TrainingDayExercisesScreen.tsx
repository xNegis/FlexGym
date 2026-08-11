import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchExerciseConfigs,
  fetchExercises,
  fetchTrainingDays,
  createExerciseConfig,
  updateExerciseConfig,
  deleteExerciseConfig,
  reorderExerciseConfigs,
  UnauthenticatedError,
  type CreateExerciseConfigPayload,
  type TrainingDayListResult,
  type UpdateExerciseConfigPayload,
} from "../api";
import { useAuth } from "../context";
import type { ConfiguredExercise, ExerciseSummary } from "../types";
import {
  EQUIPMENT_FILTERS,
  MUSCLE_GROUP_FILTERS,
  equipmentLabel,
  muscleLabel,
} from "../components/exerciseConstants";
import { parseTargetShorthand } from "../components/shorthandParser";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Section, { Divider } from "../ui/Section";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import { Field, TextInput, Select } from "../ui/Field";
import Dialog from "../ui/Dialog";
import EmptyState from "../ui/EmptyState";
import IconButton from "../ui/IconButton";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import styles from "./Screen.module.css";

type TargetType = "repetitions" | "duration_seconds" | "distance_meters";

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  repetitions: "Repetitions",
  duration_seconds: "Duration (seconds)",
  distance_meters: "Distance (metres)",
};

interface LocalSet {
  targetValue: string;
  targetWeightKg: string;
  targetRir: string;
  eccentricSeconds: string;
  stretchedPauseSeconds: string;
  concentricSeconds: string;
  peakContractionSeconds: string;
  restAfterSetSeconds: string;
  notes: string;
}

interface LocalExercise {
  exerciseSlug: string;
  targetType: TargetType;
  targetShorthand: string;
  restAfterExerciseSeconds: string;
  notes: string;
  sets: LocalSet[];
}

type ViewMode = "list" | "add" | "edit";

function makeEmptySet(): LocalSet {
  return {
    targetValue: "",
    targetWeightKg: "",
    targetRir: "",
    eccentricSeconds: "",
    stretchedPauseSeconds: "",
    concentricSeconds: "",
    peakContractionSeconds: "",
    restAfterSetSeconds: "",
    notes: "",
  };
}

function configToLocal(config: ConfiguredExercise): LocalExercise {
  return {
    exerciseSlug: config.exercise.slug,
    targetType: config.target_type as TargetType,
    targetShorthand: config.sets.map((s) => String(s.target_value)).join(", "),
    restAfterExerciseSeconds: config.rest_after_exercise_seconds?.toString() ?? "",
    notes: config.notes ?? "",
    sets: config.sets.map((s) => ({
      targetValue: String(s.target_value),
      targetWeightKg: s.target_weight_kg?.toString() ?? "",
      targetRir: s.target_rir?.toString() ?? "",
      eccentricSeconds: s.tempo?.eccentric_seconds?.toString() ?? "",
      stretchedPauseSeconds: s.tempo?.stretched_pause_seconds?.toString() ?? "",
      concentricSeconds: s.tempo?.concentric_seconds?.toString() ?? "",
      peakContractionSeconds: s.tempo?.peak_contraction_seconds?.toString() ?? "",
      restAfterSetSeconds: s.rest_after_set_seconds?.toString() ?? "",
      notes: s.notes ?? "",
    })),
  };
}

function buildPayload(local: LocalExercise): CreateExerciseConfigPayload | null {
  const targetType = local.targetType;
  const parsed = parseTargetShorthand(local.targetShorthand, targetType);
  if ("error" in parsed) return null;
  const values = parsed.values;

  const sets = values.map((targetValue, i) => {
    const s = local.sets[i] ?? makeEmptySet();
    const hasTempo =
      s.eccentricSeconds.trim() ||
      s.stretchedPauseSeconds.trim() ||
      s.concentricSeconds.trim() ||
      s.peakContractionSeconds.trim();

    return {
      target_value: targetValue,
      target_weight_kg: s.targetWeightKg.trim() ? parseFloat(s.targetWeightKg) : null,
      target_rir: s.targetRir.trim() ? parseInt(s.targetRir, 10) : null,
      tempo: hasTempo
        ? {
            eccentric_seconds: parseInt(s.eccentricSeconds, 10) || 0,
            stretched_pause_seconds: parseInt(s.stretchedPauseSeconds, 10) || 0,
            concentric_seconds: parseInt(s.concentricSeconds, 10) || 0,
            peak_contraction_seconds: parseInt(s.peakContractionSeconds, 10) || 0,
          }
        : null,
      rest_after_set_seconds: s.restAfterSetSeconds.trim()
        ? parseInt(s.restAfterSetSeconds, 10)
        : null,
      notes: s.notes.trim() || null,
    };
  });

  return {
    exercise_slug: local.exerciseSlug,
    target_type: targetType,
    rest_after_exercise_seconds: local.restAfterExerciseSeconds.trim()
      ? parseInt(local.restAfterExerciseSeconds, 10)
      : null,
    notes: local.notes.trim() || null,
    sets,
  };
}

function buildUpdatePayload(payload: CreateExerciseConfigPayload): UpdateExerciseConfigPayload {
  return {
    target_type: payload.target_type,
    rest_after_exercise_seconds: payload.rest_after_exercise_seconds,
    notes: payload.notes,
    sets: payload.sets,
  };
}

export default function TrainingDayExercisesScreen() {
  const { routineId, trainingDayId } = useParams<{ routineId: string; trainingDayId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const rid = Number(routineId);
  const did = Number(trainingDayId);
  const hasValidRouteIds = Number.isInteger(rid) && rid > 0 && Number.isInteger(did) && did > 0;

  const [configs, setConfigs] = useState<ConfiguredExercise[] | null>(null);
  const [trainingDays, setTrainingDays] = useState<TrainingDayListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [showDelete, setShowDelete] = useState<number | null>(null);
  const [showReduceWarning, setShowReduceWarning] = useState(false);

  const [local, setLocal] = useState<LocalExercise>({
    exerciseSlug: "",
    targetType: "repetitions",
    targetShorthand: "",
    restAfterExerciseSeconds: "",
    notes: "",
    sets: [makeEmptySet()],
  });
  const [showAdvanced, setShowAdvanced] = useState<Record<number, boolean>>({});
  const [shorthandError, setShorthandError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Set<number>>(new Set());

  const [catalogExercises, setCatalogExercises] = useState<ExerciseSummary[] | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogMuscle, setCatalogMuscle] = useState("");
  const [catalogEquipment, setCatalogEquipment] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);
  const catalogRequestSeq = useRef(0);

  const loadConfigs = useCallback(async () => {
    if (!hasValidRouteIds) return;
    setError(null);
    try {
      const [configsResult, daysResult] = await Promise.all([
        fetchExerciseConfigs(rid, did),
        fetchTrainingDays(rid),
      ]);
      if ("detail" in configsResult) {
        setError(configsResult.detail);
      } else {
        setConfigs(configsResult);
      }
      setTrainingDays(daysResult);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to load exercises. Please try again.");
    }
  }, [rid, did, hasValidRouteIds, logout]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const loadCatalog = useCallback(async () => {
    if (!showCatalog) return;
    const seq = ++catalogRequestSeq.current;
    try {
      const params: { search?: string; primary_muscle?: string; equipment?: string } = {};
      const trimmed = catalogSearch.trim();
      if (trimmed) params.search = trimmed;
      if (catalogMuscle) params.primary_muscle = catalogMuscle;
      if (catalogEquipment) params.equipment = catalogEquipment;
      const data = await fetchExercises(params);
      if (seq !== catalogRequestSeq.current) return;
      setCatalogExercises(data);
    } catch {
      if (seq === catalogRequestSeq.current) {
        setCatalogExercises(null);
      }
    }
  }, [showCatalog, catalogSearch, catalogMuscle, catalogEquipment]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const configuredSlugs = new Set(configs?.map((c) => c.exercise.slug) ?? []);

  const handleShorthandChange = (value: string) => {
    setLocal((prev) => ({ ...prev, targetShorthand: value }));
    const parsed = parseTargetShorthand(value, local.targetType);
    if ("error" in parsed) {
      setShorthandError(parsed.error);
      return;
    }
    setShorthandError(null);
    const newCount = parsed.values.length;
    const currentCount = local.sets.length;
    if (newCount > currentCount) {
      setLocal((prev) => ({
        ...prev,
        sets: [
          ...prev.sets,
          ...Array.from({ length: newCount - currentCount }, () => makeEmptySet()),
        ],
      }));
    } else if (newCount < currentCount) {
      setShowReduceWarning(true);
    }
  };

  const confirmReduce = () => {
    setShowReduceWarning(false);
    const parsed = parseTargetShorthand(local.targetShorthand, local.targetType);
    if ("values" in parsed) {
      setLocal((prev) => ({
        ...prev,
        sets: prev.sets.slice(0, parsed.values.length),
      }));
    }
  };

  const cancelReduce = () => {
    setShowReduceWarning(false);
    setLocal((prev) => ({
      ...prev,
      targetShorthand: prev.sets.map((s) => s.targetValue || "0").join(", "),
    }));
  };

  const applyToAllSets = (field: keyof LocalSet, value: string) => {
    setLocal((prev) => ({
      ...prev,
      sets: prev.sets.map((s) => ({ ...s, [field]: value })),
    }));
  };

  const canSave = () => {
    if (!local.exerciseSlug || !local.targetShorthand.trim()) return false;
    if (shorthandError) return false;
    if (validationErrors.size > 0) return false;
    return true;
  };

  const handleSaveNew = async () => {
    if (!canSave()) return;
    const payload = buildPayload(local);
    if (!payload) return;
    setActionPending(true);
    setActionError(null);
    try {
      const result = await createExerciseConfig(rid, did, payload);
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setViewMode("list");
        await loadConfigs();
        resetLocal();
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!canSave() || editingId === null) return;
    const payload = buildPayload(local);
    if (!payload) return;
    setActionPending(true);
    setActionError(null);
    try {
      const result = await updateExerciseConfig(rid, did, editingId, buildUpdatePayload(payload));
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setViewMode("list");
        setEditingId(null);
        await loadConfigs();
        resetLocal();
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleDelete = async (configId: number) => {
    setActionPending(true);
    setActionError(null);
    try {
      const result = await deleteExerciseConfig(rid, did, configId);
      if (result !== null) {
        setActionError(result.detail);
      } else {
        setShowDelete(null);
        await loadConfigs();
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const handleMove = async (configId: number, direction: "up" | "down") => {
    if (!configs) return;
    const index = configs.findIndex((c) => c.id === configId);
    if (index === -1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= configs.length) return;
    const newIds = configs.map((c) => c.id);
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    setActionPending(true);
    setActionError(null);
    try {
      const result = await reorderExerciseConfigs(rid, did, newIds);
      if ("detail" in result) {
        setActionError(result.detail);
      } else {
        setConfigs(result);
      }
    } catch {
      setActionError("Unable to reach the server. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const startAdd = () => {
    if (configs !== null && configs.length >= 20) return;
    resetLocal();
    setViewMode("add");
  };

  const startEdit = (config: ConfiguredExercise) => {
    setLocal(configToLocal(config));
    setEditingId(config.id);
    setViewMode("edit");
    setShowAdvanced({});
    setShorthandError(null);
    setValidationErrors(new Set());
  };

  const resetLocal = () => {
    setLocal({
      exerciseSlug: "",
      targetType: "repetitions",
      targetShorthand: "",
      restAfterExerciseSeconds: "",
      notes: "",
      sets: [makeEmptySet()],
    });
    setShorthandError(null);
    setValidationErrors(new Set());
    setShowAdvanced({});
  };

  const cancelAdd = () => {
    setViewMode("list");
    resetLocal();
  };

  const trainingDay =
    trainingDays && !("detail" in trainingDays) ? trainingDays.find((d) => d.id === did) : null;
  const dayName = trainingDay?.name ?? "Training day";

  if (!hasValidRouteIds) {
    return (
      <>
        <AppHeader title="Training day not found" showBack onBack={() => navigate("/plan")} />
        <Page width="reading">
          <Alert variant="error">
            The training day you are looking for does not exist or is not accessible.
          </Alert>
          <Button variant="secondary" onClick={() => navigate("/plan")}>
            Back to routines
          </Button>
        </Page>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AppHeader
          title={dayName}
          showBack
          onBack={() => navigate(`/plan/routines/${routineId}`)}
        />
        <Page width="planning">
          <Alert variant="error">
            <div className={styles.stack2}>
              <span>{error}</span>
              <Button variant="secondary" size="small" onClick={loadConfigs}>
                Retry
              </Button>
            </div>
          </Alert>
        </Page>
      </>
    );
  }

  if (configs === null) {
    return (
      <>
        <AppHeader
          title={dayName}
          showBack
          onBack={() => navigate(`/plan/routines/${routineId}`)}
        />
        <Page width="planning">
          <LoadingState label="Loading exercises..." />
        </Page>
      </>
    );
  }

  if (viewMode === "list") {
    return (
      <>
        <AppHeader
          title={dayName}
          showBack
          onBack={() => navigate(`/plan/routines/${routineId}`)}
        />
        <Page width="planning">
          {actionError && (
            <div className={styles.mb4}>
              <Alert variant="error">{actionError}</Alert>
            </div>
          )}

          {configs.length === 0 && (
            <EmptyState
              title="No exercises configured"
              description="Add exercises from the catalog to build this training day."
              action={
                <Button variant="primary" onClick={startAdd}>
                  Add exercise
                </Button>
              }
            />
          )}

          {configs.length > 0 && (
            <>
              <div className={styles.mb4}>
                <Button
                  variant="primary"
                  onClick={startAdd}
                  fullWidth
                  disabled={configs.length >= 20}
                >
                  Add exercise
                </Button>
                {configs.length >= 20 && (
                  <p className={`${styles.textCaptionSubtle} ${styles.mt2}`}>
                    Maximum of 20 exercises reached.
                  </p>
                )}
              </div>

              <Section title="Configured exercises">
                <div className={styles.stack2}>
                  {configs.map((config, index) => (
                    <Card key={config.id} className={styles.fullWidth}>
                      <div className={styles.rowBetweenStart}>
                        <div className={styles.reorderControls}>
                          <IconButton
                            label={`Move ${config.exercise.name} up`}
                            onClick={() => handleMove(config.id, "up")}
                            disabled={index === 0 || actionPending}
                          >
                            <ChevronUp size={16} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={`Move ${config.exercise.name} down`}
                            onClick={() => handleMove(config.id, "down")}
                            disabled={index === configs.length - 1 || actionPending}
                          >
                            <ChevronDown size={16} aria-hidden="true" />
                          </IconButton>
                        </div>
                        <button
                          type="button"
                          className={styles.entityOpenButton}
                          onClick={() => startEdit(config)}
                        >
                          <div className={styles.cardTitle}>{config.exercise.name}</div>
                          <div className={styles.cardMeta}>
                            {TARGET_TYPE_LABELS[config.target_type as TargetType] ||
                              config.target_type}{" "}
                            &middot; {config.sets.length}{" "}
                            {config.sets.length === 1 ? "set" : "sets"}
                            {config.target_type === "repetitions" &&
                              ` \u00B7 ${config.sets.map((s) => s.target_value).join(", ")}`}
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => setShowDelete(config.id)}
                          className={styles.dangerText}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </Section>
            </>
          )}
        </Page>

        <Dialog
          open={showDelete !== null}
          title="Delete exercise"
          onClose={actionPending ? () => {} : () => setShowDelete(null)}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowDelete(null)}
                disabled={actionPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => showDelete !== null && handleDelete(showDelete)}
                disabled={actionPending}
              >
                {actionPending ? "Deleting..." : "Delete"}
              </Button>
            </>
          }
        >
          <p>
            Are you sure you want to remove "
            {configs.find((config) => config.id === showDelete)?.exercise.name ?? "this exercise"}"
            from the training day? All planned sets, loads, notes, and prescription data will be
            permanently deleted.
          </p>
          {actionError && <Alert variant="error">{actionError}</Alert>}
        </Dialog>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title={viewMode === "add" ? "Add exercise" : "Edit exercise"}
        showBack
        onBack={cancelAdd}
      />
      <Page width="planning">
        {actionError && (
          <div className={styles.mb4}>
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}

        {viewMode === "add" && (
          <>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setShowCatalog(true);
                setCatalogSearch("");
                setCatalogMuscle("");
                setCatalogEquipment("");
              }}
              className={styles.mb4}
            >
              {local.exerciseSlug
                ? `Selected: ${configs?.find((c) => c.exercise.slug === local.exerciseSlug)?.exercise.name ?? catalogExercises?.find((e) => e.slug === local.exerciseSlug)?.name ?? local.exerciseSlug}`
                : "Select exercise from catalog"}
            </Button>

            <Dialog
              open={showCatalog}
              title="Select exercise"
              onClose={() => setShowCatalog(false)}
              actions={
                <Button variant="secondary" onClick={() => setShowCatalog(false)}>
                  Close
                </Button>
              }
            >
              <div className={styles.stack3}>
                <Field htmlFor="catalog-search-2" label="Search exercises">
                  <TextInput
                    id="catalog-search-2"
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Search by exercise name..."
                  />
                </Field>
                <div className={styles.fieldGrid}>
                  <Field htmlFor="catalog-muscle-2" label="Primary muscle">
                    <Select
                      id="catalog-muscle-2"
                      value={catalogMuscle}
                      onChange={(e) => setCatalogMuscle(e.target.value)}
                    >
                      <option value="">All muscles</option>
                      {MUSCLE_GROUP_FILTERS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field htmlFor="catalog-equip-2" label="Equipment">
                    <Select
                      id="catalog-equip-2"
                      value={catalogEquipment}
                      onChange={(e) => setCatalogEquipment(e.target.value)}
                    >
                      <option value="">All equipment</option>
                      {EQUIPMENT_FILTERS.map((eq) => (
                        <option key={eq.value} value={eq.value}>
                          {eq.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className={styles.scrollList}>
                  {catalogExercises === null && <LoadingState label="Loading..." />}
                  {catalogExercises?.length === 0 && (
                    <p className={styles.emptyListText}>No exercises found.</p>
                  )}
                  {catalogExercises
                    ?.filter((e) => !configuredSlugs.has(e.slug))
                    .map((ex) => (
                      <Card
                        key={ex.slug}
                        clickable
                        onClick={() => {
                          setLocal((prev) => ({ ...prev, exerciseSlug: ex.slug }));
                          setShowCatalog(false);
                        }}
                      >
                        <div>
                          <div className={styles.cardTitle}>{ex.name}</div>
                          <div className={styles.cardMeta}>
                            {muscleLabel(ex.primary_muscle)} &middot; {equipmentLabel(ex.equipment)}
                          </div>
                        </div>
                      </Card>
                    ))}
                  {catalogExercises
                    ?.filter((e) => configuredSlugs.has(e.slug))
                    .map((ex) => (
                      <div key={ex.slug} className={styles.disabledListItem}>
                        {ex.name} — Already configured
                      </div>
                    ))}
                </div>
              </div>
            </Dialog>
          </>
        )}

        <Field htmlFor="target-type" label="Target type">
          <Select
            id="target-type"
            value={local.targetType}
            onChange={(e) => {
              const newType = e.target.value as TargetType;
              setLocal((prev) => ({ ...prev, targetType: newType, targetShorthand: "" }));
              setShorthandError(null);
            }}
            disabled={actionPending}
          >
            <option value="repetitions">Repetitions</option>
            <option value="duration_seconds">Duration (seconds)</option>
            <option value="distance_meters">Distance (metres)</option>
          </Select>
        </Field>

        <div className={styles.mt4}>
          <Field
            htmlFor="target-shorthand"
            label={`Target values (${local.targetType === "repetitions" ? "e.g., 12, 10, 8" : local.targetType === "duration_seconds" ? "e.g., 60, 45, 30" : "e.g., 100, 80, 60"})`}
            error={shorthandError ?? undefined}
            hint="Comma-separated values. One set is created per value."
          >
            <TextInput
              id="target-shorthand"
              type="text"
              value={local.targetShorthand}
              onChange={(e) => handleShorthandChange(e.target.value)}
              disabled={actionPending}
              error={shorthandError ?? undefined}
            />
          </Field>
        </div>

        {local.sets.length > 0 && (
          <Section title={`Sets (${local.sets.length})`} className={styles.mt6}>
            <div className={styles.stack4}>
              {local.sets.map((set, index) => (
                <Card key={index} className={styles.fullWidth}>
                  <div className={styles.subsectionHeading}>
                    <span>Set {index + 1}</span>
                    <Badge variant="default">
                      {(function () {
                        const p = parseTargetShorthand(local.targetShorthand, local.targetType);
                        return "values" in p ? p.values[index] : "?";
                      })()}{" "}
                      {local.targetType === "repetitions"
                        ? "reps"
                        : local.targetType === "duration_seconds"
                          ? "s"
                          : "m"}
                    </Badge>
                  </div>

                  <div className={styles.stack3}>
                    <div className={styles.twoColumnGrid}>
                      <Field htmlFor={`set-${index}-weight`} label="Planned load (kg)" optional>
                        <TextInput
                          id={`set-${index}-weight`}
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min={0}
                          max={5000}
                          value={set.targetWeightKg}
                          onChange={(e) => {
                            const newSets = [...local.sets];
                            newSets[index] = { ...newSets[index], targetWeightKg: e.target.value };
                            setLocal((prev) => ({ ...prev, sets: newSets }));
                          }}
                          disabled={actionPending}
                        />
                      </Field>
                      <Field htmlFor={`set-${index}-rir`} label="Target RIR" optional>
                        <TextInput
                          id={`set-${index}-rir`}
                          type="number"
                          inputMode="numeric"
                          step="1"
                          min={0}
                          max={10}
                          value={set.targetRir}
                          onChange={(e) => {
                            const newSets = [...local.sets];
                            newSets[index] = { ...newSets[index], targetRir: e.target.value };
                            setLocal((prev) => ({ ...prev, sets: newSets }));
                          }}
                          disabled={actionPending}
                        />
                      </Field>
                    </div>

                    <div className={styles.twoColumnGrid}>
                      <Field htmlFor={`set-${index}-rest`} label="Rest after set (s)" optional>
                        <TextInput
                          id={`set-${index}-rest`}
                          type="number"
                          inputMode="numeric"
                          step="5"
                          min={0}
                          max={3600}
                          value={set.restAfterSetSeconds}
                          onChange={(e) => {
                            const newSets = [...local.sets];
                            newSets[index] = {
                              ...newSets[index],
                              restAfterSetSeconds: e.target.value,
                            };
                            setLocal((prev) => ({ ...prev, sets: newSets }));
                          }}
                          disabled={actionPending}
                        />
                      </Field>
                      <Field htmlFor={`set-${index}-notes`} label="Set notes" optional>
                        <TextInput
                          id={`set-${index}-notes`}
                          type="text"
                          value={set.notes}
                          onChange={(e) => {
                            const newSets = [...local.sets];
                            newSets[index] = { ...newSets[index], notes: e.target.value };
                            setLocal((prev) => ({ ...prev, sets: newSets }));
                          }}
                          maxLength={500}
                          disabled={actionPending}
                        />
                      </Field>
                    </div>

                    <Button
                      variant="ghost"
                      fullWidth
                      onClick={() =>
                        setShowAdvanced((prev) => ({ ...prev, [index]: !prev[index] }))
                      }
                      aria-expanded={showAdvanced[index] ?? false}
                    >
                      {showAdvanced[index] ? (
                        <ChevronUp size={16} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={16} aria-hidden="true" />
                      )}
                      Tempo and advanced
                    </Button>

                    {showAdvanced[index] && (
                      <div className={styles.advancedPanel}>
                        <p className={styles.textCaptionSubtle}>
                          Tempo components (seconds): eccentric &middot; stretch pause &middot;
                          concentric &middot; peak contraction
                        </p>
                        <div className={styles.twoColumnGrid}>
                          <Field htmlFor={`set-${index}-ecc`} label="Eccentric">
                            <TextInput
                              id={`set-${index}-ecc`}
                              type="number"
                              inputMode="numeric"
                              step="1"
                              min={0}
                              max={60}
                              value={set.eccentricSeconds}
                              onChange={(e) => {
                                const newSets = [...local.sets];
                                newSets[index] = {
                                  ...newSets[index],
                                  eccentricSeconds: e.target.value,
                                };
                                setLocal((prev) => ({ ...prev, sets: newSets }));
                              }}
                              disabled={actionPending}
                            />
                          </Field>
                          <Field htmlFor={`set-${index}-sp`} label="Stretch pause">
                            <TextInput
                              id={`set-${index}-sp`}
                              type="number"
                              inputMode="numeric"
                              step="1"
                              min={0}
                              max={60}
                              value={set.stretchedPauseSeconds}
                              onChange={(e) => {
                                const newSets = [...local.sets];
                                newSets[index] = {
                                  ...newSets[index],
                                  stretchedPauseSeconds: e.target.value,
                                };
                                setLocal((prev) => ({ ...prev, sets: newSets }));
                              }}
                              disabled={actionPending}
                            />
                          </Field>
                          <Field htmlFor={`set-${index}-con`} label="Concentric">
                            <TextInput
                              id={`set-${index}-con`}
                              type="number"
                              inputMode="numeric"
                              step="1"
                              min={0}
                              max={60}
                              value={set.concentricSeconds}
                              onChange={(e) => {
                                const newSets = [...local.sets];
                                newSets[index] = {
                                  ...newSets[index],
                                  concentricSeconds: e.target.value,
                                };
                                setLocal((prev) => ({ ...prev, sets: newSets }));
                              }}
                              disabled={actionPending}
                            />
                          </Field>
                          <Field htmlFor={`set-${index}-pc`} label="Peak contraction">
                            <TextInput
                              id={`set-${index}-pc`}
                              type="number"
                              inputMode="numeric"
                              step="1"
                              min={0}
                              max={60}
                              value={set.peakContractionSeconds}
                              onChange={(e) => {
                                const newSets = [...local.sets];
                                newSets[index] = {
                                  ...newSets[index],
                                  peakContractionSeconds: e.target.value,
                                };
                                setLocal((prev) => ({ ...prev, sets: newSets }));
                              }}
                              disabled={actionPending}
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <div className={styles.applyAllPanel}>
              <p className={styles.panelLabel}>Apply to all sets:</p>
              <div className={styles.rowWrap2}>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    applyToAllSets("targetWeightKg", local.sets[0]?.targetWeightKg ?? "")
                  }
                >
                  Same load
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => applyToAllSets("targetRir", local.sets[0]?.targetRir ?? "")}
                >
                  Same RIR
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    applyToAllSets("restAfterSetSeconds", local.sets[0]?.restAfterSetSeconds ?? "")
                  }
                >
                  Same rest
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    applyToAllSets("eccentricSeconds", local.sets[0]?.eccentricSeconds ?? "")
                  }
                >
                  Same eccentric
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    applyToAllSets(
                      "stretchedPauseSeconds",
                      local.sets[0]?.stretchedPauseSeconds ?? "",
                    )
                  }
                >
                  Same stretch
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    applyToAllSets("concentricSeconds", local.sets[0]?.concentricSeconds ?? "")
                  }
                >
                  Same concentric
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    applyToAllSets(
                      "peakContractionSeconds",
                      local.sets[0]?.peakContractionSeconds ?? "",
                    )
                  }
                >
                  Same peak
                </Button>
              </div>
            </div>
          </Section>
        )}

        <Divider />

        <Section title="Exercise-level settings" className={styles.mt2}>
          <div className={styles.stack4}>
            <Field htmlFor="exercise-rest" label="Rest after exercise (s)" optional>
              <TextInput
                id="exercise-rest"
                type="number"
                inputMode="numeric"
                step="5"
                min={0}
                max={3600}
                value={local.restAfterExerciseSeconds}
                onChange={(e) =>
                  setLocal((prev) => ({ ...prev, restAfterExerciseSeconds: e.target.value }))
                }
                disabled={actionPending}
              />
            </Field>
            <Field htmlFor="exercise-notes" label="Exercise notes" optional>
              <TextInput
                id="exercise-notes"
                type="text"
                value={local.notes}
                onChange={(e) => setLocal((prev) => ({ ...prev, notes: e.target.value }))}
                maxLength={1000}
                disabled={actionPending}
              />
            </Field>
          </div>
        </Section>

        <div className={`${styles.row3} ${styles.mt4}`}>
          <Button variant="secondary" onClick={cancelAdd} disabled={actionPending} fullWidth>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={viewMode === "add" ? handleSaveNew : handleSaveEdit}
            disabled={!canSave() || actionPending}
            fullWidth
          >
            {actionPending ? "Saving..." : `Save ${viewMode === "add" ? "exercise" : "changes"}`}
          </Button>
        </div>
      </Page>

      <Dialog
        open={showReduceWarning}
        title="Reduce sets"
        onClose={cancelReduce}
        actions={
          <>
            <Button variant="secondary" onClick={cancelReduce} disabled={actionPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmReduce} disabled={actionPending}>
              Reduce sets
            </Button>
          </>
        }
      >
        <p>
          Reducing the number of target values will permanently delete some sets and their
          configuration. This cannot be undone. Continue?
        </p>
      </Dialog>
    </>
  );
}
