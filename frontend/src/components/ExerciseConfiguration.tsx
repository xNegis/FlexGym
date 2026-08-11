import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createExerciseConfig,
  deleteExerciseConfig,
  fetchExerciseConfigs,
  fetchExercises,
  reorderExerciseConfigs,
  UnauthenticatedError,
  updateExerciseConfig,
} from "../api";
import type { ConfiguredExercise, ConfiguredSet, ExerciseSummary, TrainingDay } from "../types";
import { parseTargetShorthand } from "./shorthandParser";

interface Props {
  routineId: number;
  trainingDay: TrainingDay;
  routineName: string;
  onUnauthenticated: () => void;
  onBack: () => void;
}

type ViewMode = "list" | "add" | "edit" | "delete";

type TargetType = "repetitions" | "duration_seconds" | "distance_meters";

interface EditableSet {
  target_value: number;
  target_weight_kg: string;
  target_rir: string;
  eccentric_seconds: string;
  stretched_pause_seconds: string;
  concentric_seconds: string;
  peak_contraction_seconds: string;
  rest_after_set_seconds: string;
  notes: string;
}

interface ConfigForm {
  exercise_slug: string;
  target_type: TargetType;
  shorthand: string;
  rest_after_exercise_seconds: string;
  notes: string;
  sets: EditableSet[];
}

const EMPTY_SET: EditableSet = {
  target_value: 0,
  target_weight_kg: "",
  target_rir: "",
  eccentric_seconds: "",
  stretched_pause_seconds: "",
  concentric_seconds: "",
  peak_contraction_seconds: "",
  rest_after_set_seconds: "",
  notes: "",
};

const TARGET_TYPE_OPTIONS: { value: TargetType; label: string }[] = [
  { value: "repetitions", label: "Repetitions" },
  { value: "duration_seconds", label: "Duration (seconds)" },
  { value: "distance_meters", label: "Distance (metres)" },
];

const SHORTHAND_EXAMPLES: Record<TargetType, string> = {
  repetitions: "e.g. 12, 12, 10, 8",
  duration_seconds: "e.g. 30, 30, 45",
  distance_meters: "e.g. 20, 20, 15.5",
};

function exerciseCountLabel(count: number): string {
  if (count === 0) return "No exercises";
  if (count === 1) return "1 exercise";
  return `${count} exercises`;
}

function setFromConfig(s: ConfiguredSet): EditableSet {
  return {
    target_value: s.target_value,
    target_weight_kg: s.target_weight_kg != null ? String(s.target_weight_kg) : "",
    target_rir: s.target_rir != null ? String(s.target_rir) : "",
    eccentric_seconds: s.tempo ? String(s.tempo.eccentric_seconds) : "",
    stretched_pause_seconds: s.tempo ? String(s.tempo.stretched_pause_seconds) : "",
    concentric_seconds: s.tempo ? String(s.tempo.concentric_seconds) : "",
    peak_contraction_seconds: s.tempo ? String(s.tempo.peak_contraction_seconds) : "",
    rest_after_set_seconds:
      s.rest_after_set_seconds != null ? String(s.rest_after_set_seconds) : "",
    notes: s.notes ?? "",
  };
}

function isTempoFilled(s: EditableSet): boolean {
  return (
    s.eccentric_seconds !== "" ||
    s.stretched_pause_seconds !== "" ||
    s.concentric_seconds !== "" ||
    s.peak_contraction_seconds !== ""
  );
}

function isTempoComplete(s: EditableSet): boolean {
  return (
    s.eccentric_seconds !== "" &&
    s.stretched_pause_seconds !== "" &&
    s.concentric_seconds !== "" &&
    s.peak_contraction_seconds !== ""
  );
}

function parseOptionalInt(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be ${minimum}-${maximum}`);
  }
  return parsed;
}

function parseOptionalWeight(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error("Target weight must be a valid number");
  }
  if (parsed < 0 || parsed > 5000) {
    throw new Error("Target weight must be 0-5000 kg");
  }
  if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-9) {
    throw new Error("Target weight must have at most two decimal places");
  }
  return parsed;
}

function setsToShorthand(sets: EditableSet[]): string {
  return sets.map((s) => String(s.target_value)).join(", ");
}

export default function ExerciseConfiguration({
  routineId,
  trainingDay,
  routineName,
  onUnauthenticated,
  onBack,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [configs, setConfigs] = useState<ConfiguredExercise[] | null>(null);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestSequence = useRef(0);

  // Catalog picker state
  const [catalog, setCatalog] = useState<ExerciseSummary[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");

  // Config form
  const [form, setForm] = useState<ConfigForm>(() => ({
    exercise_slug: "",
    target_type: "repetitions",
    shorthand: "",
    rest_after_exercise_seconds: "",
    notes: "",
    sets: [],
  }));
  const [shorthandError, setShorthandError] = useState<string | null>(null);
  const [editConfigId, setEditConfigId] = useState<number | null>(null);
  const [deleteConfigId, setDeleteConfigId] = useState<number | null>(null);
  const [setReductionWarning, setSetReductionWarning] = useState<string | null>(null);
  const [pendingReductionValues, setPendingReductionValues] = useState<number[] | null>(null);
  const [applyAllTempo, setApplyAllTempo] = useState("");

  const loadConfigs = useCallback(async () => {
    const seq = ++requestSequence.current;
    setConfigsLoading(true);
    setError(null);
    try {
      const result = await fetchExerciseConfigs(routineId, trainingDay.id);
      if (seq !== requestSequence.current) return;
      if ("detail" in result) {
        setError(result.detail);
      } else {
        setConfigs(result);
      }
    } catch (e) {
      if (seq !== requestSequence.current) return;
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to load exercises");
    } finally {
      if (seq === requestSequence.current) setConfigsLoading(false);
    }
  }, [routineId, trainingDay.id, onUnauthenticated]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleBack = () => {
    onBack();
  };

  // -- Catalog picker ---------------------------------------------------

  const configuredSlugs = useMemo(
    () => new Set((configs ?? []).map((c) => c.exercise.slug)),
    [configs],
  );

  const filteredCatalog = useMemo(() => {
    if (!catalog) return null;
    return catalog.filter((e) => !configuredSlugs.has(e.slug));
  }, [catalog, configuredSlugs]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const params: { search?: string; primary_muscle?: string; equipment?: string } = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (muscleFilter) params.primary_muscle = muscleFilter;
      if (equipmentFilter) params.equipment = equipmentFilter;
      const exercises = await fetchExercises(params);
      setCatalog(exercises);
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setCatalogError("Unable to load exercise catalog");
    } finally {
      setCatalogLoading(false);
    }
  }, [searchTerm, muscleFilter, equipmentFilter, onUnauthenticated]);

  useEffect(() => {
    if (viewMode === "add") {
      loadCatalog();
    }
  }, [viewMode, loadCatalog]);

  const openAdd = () => {
    setForm({
      exercise_slug: "",
      target_type: "repetitions",
      shorthand: "",
      rest_after_exercise_seconds: "",
      notes: "",
      sets: [],
    });
    setShorthandError(null);
    setError(null);
    setSetReductionWarning(null);
    setPendingReductionValues(null);
    setApplyAllTempo("");
    setSearchTerm("");
    setMuscleFilter("");
    setEquipmentFilter("");
    setViewMode("add");
  };

  const selectExercise = (slug: string) => {
    setForm((f) => ({ ...f, exercise_slug: slug }));
  };

  // -- Shorthand and sets -----------------------------------------------

  const updateShorthand = (value: string) => {
    setSetReductionWarning(null);
    setPendingReductionValues(null);
    const currentSets = form.sets;
    const parsed = parseTargetShorthand(value, form.target_type);

    if ("error" in parsed) {
      setShorthandError(parsed.error);
      setForm((f) => ({ ...f, shorthand: value }));
      return;
    }

    setShorthandError(null);

    if (parsed.values.length < currentSets.length) {
      setSetReductionWarning(
        `Reducing from ${currentSets.length} to ${parsed.values.length} sets will permanently delete the last ${currentSets.length - parsed.values.length} sets' configuration.`,
      );
      setPendingReductionValues(parsed.values);
      setForm((f) => ({ ...f, shorthand: value }));
      return;
    }

    const newSets: EditableSet[] = parsed.values.map((v, i) => {
      if (i < currentSets.length) {
        return { ...currentSets[i], target_value: v };
      }
      return { ...EMPTY_SET, target_value: v };
    });

    setForm((f) => ({ ...f, shorthand: value, sets: newSets }));
  };

  const updateSetField = (index: number, field: keyof EditableSet, value: string) => {
    setForm((f) => {
      const newSets = [...f.sets];
      newSets[index] = { ...newSets[index], [field]: value };
      return { ...f, sets: newSets };
    });
  };

  const applyToAll = (field: keyof EditableSet, value: string) => {
    setForm((f) => {
      const newSets = f.sets.map((s) => ({ ...s, [field]: value }));
      return { ...f, sets: newSets };
    });
  };

  const confirmSetReduction = () => {
    if (pendingReductionValues === null) return;
    setForm((f) => ({
      ...f,
      sets: pendingReductionValues.map((value, index) => ({
        ...f.sets[index],
        target_value: value,
      })),
    }));
    setSetReductionWarning(null);
    setPendingReductionValues(null);
  };

  const cancelSetReduction = () => {
    setForm((f) => ({
      ...f,
      shorthand: setsToShorthand(f.sets),
    }));
    setSetReductionWarning(null);
    setPendingReductionValues(null);
    setShorthandError(null);
  };

  const applyTempoToAll = () => {
    const parts = applyAllTempo.split("-").map((part) => part.trim());
    if (
      parts.length !== 4 ||
      parts.some((part) => part === "" || !Number.isInteger(Number(part)))
    ) {
      setError("Tempo must use four whole numbers, for example 3-1-1-0");
      return;
    }
    const values = parts.map(Number);
    if (values.some((value) => value < 0 || value > 60) || values.every((value) => value === 0)) {
      setError("Tempo components must be 0-60 and at least one must be greater than zero");
      return;
    }
    setError(null);
    setForm((f) => ({
      ...f,
      sets: f.sets.map((set) => ({
        ...set,
        eccentric_seconds: parts[0],
        stretched_pause_seconds: parts[1],
        concentric_seconds: parts[2],
        peak_contraction_seconds: parts[3],
      })),
    }));
  };

  // -- Open edit form ---------------------------------------------------

  const openEdit = (config: ConfiguredExercise) => {
    setEditConfigId(config.id);
    const sets = config.sets.map(setFromConfig);
    setForm({
      exercise_slug: config.exercise.slug,
      target_type: config.target_type as TargetType,
      shorthand: setsToShorthand(sets),
      rest_after_exercise_seconds:
        config.rest_after_exercise_seconds != null
          ? String(config.rest_after_exercise_seconds)
          : "",
      notes: config.notes ?? "",
      sets,
    });
    setShorthandError(null);
    setError(null);
    setSetReductionWarning(null);
    setPendingReductionValues(null);
    setApplyAllTempo("");
    setViewMode("edit");
  };

  // -- Save -------------------------------------------------------------

  const buildPayload = () => {
    const sets = form.sets.map((s, index) => {
      const setLabel = `Set ${index + 1}`;
      const weight = parseOptionalWeight(s.target_weight_kg);
      const rir = parseOptionalInt(s.target_rir, `${setLabel} RIR`, 0, 10);
      const rest = parseOptionalInt(s.rest_after_set_seconds, `${setLabel} rest`, 0, 3600);

      let tempo: {
        eccentric_seconds: number;
        stretched_pause_seconds: number;
        concentric_seconds: number;
        peak_contraction_seconds: number;
      } | null = null;

      if (isTempoFilled(s) && !isTempoComplete(s)) {
        throw new Error(`${setLabel} must provide all four tempo components`);
      }

      if (isTempoComplete(s)) {
        const eccentric = parseOptionalInt(
          s.eccentric_seconds,
          `${setLabel} eccentric tempo`,
          0,
          60,
        );
        const stretched = parseOptionalInt(
          s.stretched_pause_seconds,
          `${setLabel} stretched-pause tempo`,
          0,
          60,
        );
        const concentric = parseOptionalInt(
          s.concentric_seconds,
          `${setLabel} concentric tempo`,
          0,
          60,
        );
        const peak = parseOptionalInt(
          s.peak_contraction_seconds,
          `${setLabel} peak-contraction tempo`,
          0,
          60,
        );
        if (eccentric === null || stretched === null || concentric === null || peak === null) {
          throw new Error(`${setLabel} must provide all four tempo components`);
        }
        if (eccentric + stretched + concentric + peak === 0) {
          throw new Error(`${setLabel} tempo must contain at least one non-zero component`);
        }
        tempo = {
          eccentric_seconds: eccentric,
          stretched_pause_seconds: stretched,
          concentric_seconds: concentric,
          peak_contraction_seconds: peak,
        };
      }

      return {
        target_value: s.target_value,
        target_weight_kg: weight,
        target_rir: rir,
        tempo,
        rest_after_set_seconds: rest,
        notes: s.notes.trim() || null,
      };
    });

    const restAfterExercise = parseOptionalInt(
      form.rest_after_exercise_seconds,
      "Exercise rest",
      0,
      3600,
    );

    return {
      target_type: form.target_type,
      rest_after_exercise_seconds: restAfterExercise,
      notes: form.notes.trim() || null,
      sets,
    };
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!form.sets.length) {
      setShorthandError("Enter target values");
      return;
    }
    if (pendingReductionValues !== null) {
      setError("Confirm or cancel the set reduction before saving");
      return;
    }
    let payload: ReturnType<typeof buildPayload>;
    try {
      payload = buildPayload();
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Check the exercise configuration values",
      );
      return;
    }
    setError(null);
    setShorthandError(null);
    setPending(true);

    try {
      if (viewMode === "add") {
        const result = await createExerciseConfig(routineId, trainingDay.id, {
          exercise_slug: form.exercise_slug,
          ...payload,
        });
        if ("detail" in result) {
          setError(result.detail);
        } else {
          await loadConfigs();
          setViewMode("list");
        }
      } else if (editConfigId !== null) {
        const result = await updateExerciseConfig(routineId, trainingDay.id, editConfigId, payload);
        if ("detail" in result) {
          setError(result.detail);
        } else {
          await loadConfigs();
          setViewMode("list");
        }
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to save exercise configuration");
    } finally {
      setPending(false);
    }
  };

  const cancelForm = () => {
    setViewMode("list");
    setEditConfigId(null);
    setError(null);
    setShorthandError(null);
    setSetReductionWarning(null);
    setPendingReductionValues(null);
    setApplyAllTempo("");
  };

  // -- Reorder ----------------------------------------------------------

  const handleMoveUp = async (config: ConfiguredExercise) => {
    if (!configs || configs.length < 2 || pending) return;
    const index = configs.findIndex((c) => c.id === config.id);
    if (index <= 0) return;
    const newOrder = [...configs];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    await submitReorder(newOrder.map((c) => c.id));
  };

  const handleMoveDown = async (config: ConfiguredExercise) => {
    if (!configs || configs.length < 2 || pending) return;
    const index = configs.findIndex((c) => c.id === config.id);
    if (index < 0 || index >= configs.length - 1) return;
    const newOrder = [...configs];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    await submitReorder(newOrder.map((c) => c.id));
  };

  const submitReorder = async (configIds: number[]) => {
    const previous = configs;
    setConfigs((current) => {
      if (!current) return current;
      const sorted = configIds
        .map((id) => current.find((c) => c.id === id))
        .filter((c): c is ConfiguredExercise => c !== undefined);
      return sorted.map((c, i) => ({ ...c, position: i + 1 }));
    });
    setPending(true);
    setError(null);
    try {
      const result = await reorderExerciseConfigs(routineId, trainingDay.id, configIds);
      if ("detail" in result) {
        setConfigs(previous);
        setError(result.detail);
      } else {
        setConfigs(result);
        setError(null);
      }
    } catch (reorderError) {
      setConfigs(previous);
      if (reorderError instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to reorder exercises");
    } finally {
      setPending(false);
    }
  };

  // -- Delete -----------------------------------------------------------

  const startDelete = (config: ConfiguredExercise) => {
    setDeleteConfigId(config.id);
    setError(null);
    setViewMode("delete");
  };

  const cancelDelete = () => {
    setDeleteConfigId(null);
    setError(null);
    setViewMode("list");
  };

  const handleDelete = async () => {
    if (deleteConfigId === null || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteExerciseConfig(routineId, trainingDay.id, deleteConfigId);
      if (result !== null) {
        if (result.detail === "Configured exercise not found") {
          await loadConfigs();
          setViewMode("list");
          setDeleteConfigId(null);
          return;
        }
        setError(result.detail);
      } else {
        await loadConfigs();
        setViewMode("list");
        setDeleteConfigId(null);
      }
    } catch (e) {
      if (e instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to delete exercise");
    } finally {
      setPending(false);
    }
  };

  // -- Target summary ---------------------------------------------------

  const targetLabel = (config: ConfiguredExercise): string => {
    if (config.target_type === "repetitions") {
      const targets = config.sets.map((s) => s.target_value).join(", ");
      return `${config.sets.length} set${config.sets.length !== 1 ? "s" : ""} — ${targets} reps`;
    }
    if (config.target_type === "duration_seconds") {
      const targets = config.sets.map((s) => `${s.target_value}s`).join(", ");
      return `${config.sets.length} set${config.sets.length !== 1 ? "s" : ""} — ${targets}`;
    }
    if (config.target_type === "distance_meters") {
      const targets = config.sets.map((s) => `${s.target_value}m`).join(", ");
      return `${config.sets.length} set${config.sets.length !== 1 ? "s" : ""} — ${targets}`;
    }
    return "";
  };

  const atLimit = (configs?.length ?? 0) >= 20;

  // -- Render: List view ------------------------------------------------

  if (viewMode === "list") {
    return (
      <div className="routine-detail">
        <div className="exercise-config-header">
          <button type="button" className="routine-back-link" onClick={handleBack}>
            &larr; Back to {routineName}
          </button>
          <h2 className="routine-detail-heading">
            {trainingDay.name}
            <span className="exercise-count-badge">
              {exerciseCountLabel(configs?.length ?? trainingDay.exercise_count)}
            </span>
          </h2>
        </div>

        {configsLoading ? (
          <div className="routine-loading" role="status">
            Loading exercises...
          </div>
        ) : error ? (
          <div className="routine-detail-error" role="alert">
            <p>{error}</p>
            <button type="button" className="routine-retry-button" onClick={loadConfigs}>
              Retry
            </button>
          </div>
        ) : configs && configs.length === 0 ? (
          <div className="training-days-empty">
            <p>No exercises configured yet.</p>
            <p className="routine-empty-hint">
              Select exercises from the catalog to build your workout plan for this training day.
            </p>
            <button type="button" className="auth-button" onClick={openAdd} disabled={atLimit}>
              Add exercise
            </button>
          </div>
        ) : (
          <>
            <ul className="exercise-config-list">
              {configs!.map((config) => (
                <li key={config.id} className="exercise-config-item">
                  <div className="exercise-config-row">
                    <span className="exercise-config-position">{config.position}.</span>
                    <div className="exercise-config-info">
                      <span className="exercise-config-name">{config.exercise.name}</span>
                      <span className="exercise-config-target">{targetLabel(config)}</span>
                    </div>
                    <div className="exercise-config-controls">
                      <button
                        type="button"
                        className="training-day-move-button"
                        onClick={() => handleMoveUp(config)}
                        disabled={config.position === 1 || pending}
                        aria-label={`Move ${config.exercise.name} up`}
                      >
                        &#9650;
                      </button>
                      <button
                        type="button"
                        className="training-day-move-button"
                        onClick={() => handleMoveDown(config)}
                        disabled={config.position === (configs?.length ?? 0) || pending}
                        aria-label={`Move ${config.exercise.name} down`}
                      >
                        &#9660;
                      </button>
                      <button
                        type="button"
                        className="training-day-action-button"
                        onClick={() => openEdit(config)}
                        disabled={pending}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="training-day-delete-button"
                        onClick={() => startDelete(config)}
                        disabled={pending}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {atLimit ? (
              <p className="training-days-limit-message">
                This training day has the maximum of 20 exercises. Delete an existing exercise to
                add a new one.
              </p>
            ) : (
              <div className="exercise-add-bar">
                <button type="button" className="auth-button" onClick={openAdd} disabled={pending}>
                  Add exercise
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // -- Render: Add view (catalog picker) --------------------------------

  if (viewMode === "add") {
    if (form.exercise_slug) {
      return renderConfigForm();
    }

    return (
      <div className="routine-detail">
        <div className="exercise-config-header">
          <h2 className="routine-form-heading">Select exercise</h2>
          <p className="routine-empty-hint">
            Choose an exercise from the catalog to configure for {trainingDay.name}.
          </p>
        </div>

        {catalogError && (
          <div className="routine-detail-error" role="alert">
            <p>{catalogError}</p>
            <button type="button" className="routine-retry-button" onClick={loadCatalog}>
              Retry
            </button>
          </div>
        )}

        <div className="catalog-filters">
          <input
            type="text"
            className="catalog-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search exercises..."
            disabled={catalogLoading}
          />
          <select
            value={muscleFilter}
            onChange={(e) => setMuscleFilter(e.target.value)}
            disabled={catalogLoading}
            className="catalog-filter-select"
          >
            <option value="">All muscles</option>
            <option value="chest">Chest</option>
            <option value="lats">Lats</option>
            <option value="upper_back">Upper Back</option>
            <option value="shoulders">Shoulders</option>
            <option value="biceps">Biceps</option>
            <option value="triceps">Triceps</option>
            <option value="forearms">Forearms</option>
            <option value="quadriceps">Quadriceps</option>
            <option value="hamstrings">Hamstrings</option>
            <option value="glutes">Glutes</option>
            <option value="adductors">Adductors</option>
            <option value="calves">Calves</option>
            <option value="core">Core</option>
            <option value="full_body">Full Body</option>
          </select>
          <select
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
            disabled={catalogLoading}
            className="catalog-filter-select"
          >
            <option value="">All equipment</option>
            <option value="bodyweight">Bodyweight</option>
            <option value="barbell">Barbell</option>
            <option value="dumbbell">Dumbbell</option>
            <option value="kettlebell">Kettlebell</option>
            <option value="cable">Cable</option>
            <option value="machine">Machine</option>
            <option value="resistance_band">Resistance Band</option>
            <option value="pull_up_bar">Pull-up Bar</option>
          </select>
        </div>

        {catalogLoading ? (
          <div className="routine-loading" role="status">
            Loading exercises...
          </div>
        ) : filteredCatalog === null ? null : filteredCatalog.length === 0 ? (
          <div className="training-days-empty">
            <p>No available exercises found.</p>
            {configuredSlugs.size > 0 && (
              <p className="routine-empty-hint">
                All catalog exercises are already configured for this training day.
              </p>
            )}
          </div>
        ) : (
          <ul className="catalog-picker-list">
            {filteredCatalog.map((ex) => (
              <li key={ex.slug} className="catalog-picker-item">
                <button
                  type="button"
                  className="catalog-picker-button"
                  onClick={() => selectExercise(ex.slug)}
                >
                  <span className="catalog-picker-name">{ex.name}</span>
                  <span className="catalog-picker-meta">
                    {ex.primary_muscle} · {ex.equipment}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="auth-cancel" onClick={cancelForm}>
          Cancel
        </button>
      </div>
    );
  }

  // -- Render: Config form (shared for add/edit) ------------------------

  function renderConfigForm() {
    const isEdit = viewMode === "edit";
    const selectedExercise = catalog?.find((e) => e.slug === form.exercise_slug);
    const exerciseName =
      selectedExercise?.name ??
      configs?.find((c) => c.id === editConfigId)?.exercise.name ??
      form.exercise_slug;

    return (
      <form className="routine-form" onSubmit={handleSave} noValidate>
        <h2 className="routine-form-heading">
          {isEdit ? "Edit" : "Configure"} {exerciseName}
        </h2>

        {error && (
          <div className="routine-form-error" role="alert">
            {error}
          </div>
        )}

        {/* Target type */}
        <label className="auth-field">
          <span>Target type</span>
          <select
            value={form.target_type}
            onChange={(e) => {
              const newType = e.target.value as TargetType;
              const preservedShorthand =
                pendingReductionValues === null ? form.shorthand : setsToShorthand(form.sets);
              setForm((f) => ({
                ...f,
                target_type: newType,
                shorthand: preservedShorthand,
              }));
              if (preservedShorthand.trim()) {
                const parsed = parseTargetShorthand(preservedShorthand, newType);
                setShorthandError("error" in parsed ? parsed.error : null);
              } else {
                setShorthandError(null);
              }
              setSetReductionWarning(null);
              setPendingReductionValues(null);
            }}
            disabled={pending}
          >
            {TARGET_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Target shorthand */}
        <div className="auth-field">
          <label>
            <span>Targets (comma-separated)</span>
            <input
              type="text"
              value={form.shorthand}
              onChange={(e) => updateShorthand(e.target.value)}
              placeholder={SHORTHAND_EXAMPLES[form.target_type]}
              disabled={pending}
            />
          </label>
          {shorthandError && (
            <span className="field-error" role="alert">
              {shorthandError}
            </span>
          )}
        </div>

        {/* Set reduction warning */}
        {setReductionWarning && (
          <div className="set-reduction-warning" role="alert">
            <p>{setReductionWarning}</p>
            <div className="set-reduction-actions">
              <button
                type="button"
                className="training-day-action-button"
                onClick={confirmSetReduction}
              >
                Confirm
              </button>
              <button
                type="button"
                className="training-day-cancel-button"
                onClick={cancelSetReduction}
              >
                Cancel (restore)
              </button>
            </div>
          </div>
        )}

        {/* Set cards */}
        {form.sets.length > 0 && (
          <div className="exercises-sets-section">
            <h4 className="exercises-sets-heading">Set configuration</h4>

            {/* Apply to all controls */}
            <div className="apply-all-controls">
              <div className="apply-all-row">
                <label className="apply-all-label">Apply to all:</label>
                <input
                  type="text"
                  placeholder="Weight (kg)"
                  className="apply-all-input"
                  onChange={(e) => {
                    if (e.target.value !== undefined) {
                      // Only apply on explicit button click via ref
                    }
                  }}
                  id="apply-weight"
                  disabled={pending}
                />
                <button
                  type="button"
                  className="training-day-action-button"
                  onClick={() => {
                    const input = document.getElementById("apply-weight") as HTMLInputElement;
                    applyToAll("target_weight_kg", input.value);
                  }}
                  disabled={pending}
                >
                  Set
                </button>
                <input
                  type="text"
                  placeholder="RIR"
                  className="apply-all-input"
                  id="apply-rir"
                  disabled={pending}
                />
                <button
                  type="button"
                  className="training-day-action-button"
                  onClick={() => {
                    const input = document.getElementById("apply-rir") as HTMLInputElement;
                    applyToAll("target_rir", input.value);
                  }}
                  disabled={pending}
                >
                  Set
                </button>
                <input
                  type="text"
                  placeholder="Rest (s)"
                  className="apply-all-input"
                  id="apply-rest"
                  disabled={pending}
                />
                <button
                  type="button"
                  className="training-day-action-button"
                  onClick={() => {
                    const input = document.getElementById("apply-rest") as HTMLInputElement;
                    applyToAll("rest_after_set_seconds", input.value);
                  }}
                  disabled={pending}
                >
                  Set
                </button>
                <input
                  type="text"
                  placeholder="Tempo 3-1-1-0"
                  className="apply-all-tempo-input"
                  value={applyAllTempo}
                  onChange={(e) => setApplyAllTempo(e.target.value)}
                  disabled={pending}
                  aria-label="Tempo to apply to all sets"
                />
                <button
                  type="button"
                  className="training-day-action-button"
                  onClick={applyTempoToAll}
                  disabled={pending}
                >
                  Set tempo
                </button>
              </div>
            </div>

            {form.sets.map((s, i) => (
              <div key={i} className="set-card">
                <div className="set-card-header">
                  <span className="set-card-title">Set {i + 1}</span>
                  <span className="set-card-target">
                    Target: {s.target_value}{" "}
                    {form.target_type === "repetitions"
                      ? "reps"
                      : form.target_type === "duration_seconds"
                        ? "sec"
                        : "m"}
                  </span>
                </div>

                <div className="set-card-fields">
                  <label className="set-field">
                    <span>Weight (kg)</span>
                    <input
                      type="number"
                      value={s.target_weight_kg}
                      onChange={(e) => updateSetField(i, "target_weight_kg", e.target.value)}
                      min="0"
                      max="5000"
                      step="0.01"
                      placeholder="—"
                      disabled={pending}
                    />
                  </label>

                  <label className="set-field">
                    <span>RIR</span>
                    <input
                      type="number"
                      value={s.target_rir}
                      onChange={(e) => updateSetField(i, "target_rir", e.target.value)}
                      min="0"
                      max="10"
                      step="1"
                      placeholder="—"
                      disabled={pending}
                    />
                  </label>

                  <div className="set-field tempo-field">
                    <span>Tempo</span>
                    <div className="tempo-inputs">
                      <input
                        type="number"
                        value={s.eccentric_seconds}
                        onChange={(e) => updateSetField(i, "eccentric_seconds", e.target.value)}
                        min="0"
                        max="60"
                        step="1"
                        placeholder="Ecc"
                        disabled={pending}
                        aria-label="Eccentric seconds"
                      />
                      <input
                        type="number"
                        value={s.stretched_pause_seconds}
                        onChange={(e) =>
                          updateSetField(i, "stretched_pause_seconds", e.target.value)
                        }
                        min="0"
                        max="60"
                        step="1"
                        placeholder="Pause"
                        disabled={pending}
                        aria-label="Stretched pause seconds"
                      />
                      <input
                        type="number"
                        value={s.concentric_seconds}
                        onChange={(e) => updateSetField(i, "concentric_seconds", e.target.value)}
                        min="0"
                        max="60"
                        step="1"
                        placeholder="Conc"
                        disabled={pending}
                        aria-label="Concentric seconds"
                      />
                      <input
                        type="number"
                        value={s.peak_contraction_seconds}
                        onChange={(e) =>
                          updateSetField(i, "peak_contraction_seconds", e.target.value)
                        }
                        min="0"
                        max="60"
                        step="1"
                        placeholder="Peak"
                        disabled={pending}
                        aria-label="Peak contraction seconds"
                      />
                    </div>
                    {isTempoFilled(s) && !isTempoComplete(s) && (
                      <span className="field-error">
                        All four tempo fields must be completed together
                      </span>
                    )}
                  </div>

                  <label className="set-field">
                    <span>Rest after set (s)</span>
                    <input
                      type="number"
                      value={s.rest_after_set_seconds}
                      onChange={(e) => updateSetField(i, "rest_after_set_seconds", e.target.value)}
                      min="0"
                      max="3600"
                      step="1"
                      placeholder="—"
                      disabled={pending}
                    />
                  </label>

                  <label className="set-field set-field-full">
                    <span>Set note</span>
                    <input
                      type="text"
                      value={s.notes}
                      onChange={(e) => updateSetField(i, "notes", e.target.value)}
                      maxLength={500}
                      placeholder="e.g. warm-up, back-off"
                      disabled={pending}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Exercise-level fields */}
        <label className="auth-field">
          <span>Rest after exercise (seconds)</span>
          <input
            type="number"
            value={form.rest_after_exercise_seconds}
            onChange={(e) =>
              setForm((f) => ({ ...f, rest_after_exercise_seconds: e.target.value }))
            }
            min="0"
            max="3600"
            step="1"
            placeholder="—"
            disabled={pending}
          />
        </label>

        <label className="auth-field">
          <span>Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            maxLength={1000}
            rows={2}
            placeholder="Grip, setup, or other preferences"
            disabled={pending}
          />
        </label>

        <button
          type="submit"
          className="auth-button"
          disabled={
            pending ||
            !form.sets.length ||
            shorthandError !== null ||
            pendingReductionValues !== null
          }
        >
          {pending ? "Saving..." : isEdit ? "Save" : "Add exercise"}
        </button>
        <button type="button" className="auth-cancel" onClick={cancelForm} disabled={pending}>
          Cancel
        </button>
      </form>
    );
  }

  if (viewMode === "edit") {
    return renderConfigForm();
  }

  // -- Render: Delete confirmation --------------------------------------

  if (viewMode === "delete" && deleteConfigId !== null) {
    const config = configs?.find((c) => c.id === deleteConfigId);
    return (
      <div className="routine-detail">
        <h2 className="routine-form-heading">Delete exercise</h2>

        <div className="delete-confirmation">
          <p>
            Are you sure you want to delete{" "}
            <strong>{config?.exercise.name ?? "this exercise"}</strong> from {trainingDay.name}? All
            planned sets and notes will be permanently deleted. This action cannot be undone.
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
          {pending ? "Deleting..." : "Delete exercise"}
        </button>
        <button type="button" className="auth-cancel" onClick={cancelDelete} disabled={pending}>
          Cancel
        </button>
      </div>
    );
  }

  return null;
}
