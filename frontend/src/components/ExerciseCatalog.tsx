import { useCallback, useEffect, useRef, useState } from "react";
import { fetchExercises, UnauthenticatedError } from "../api";
import type { ExerciseSummary } from "../types";
import {
  EQUIPMENT_FILTERS,
  MUSCLE_GROUP_FILTERS,
  equipmentLabel,
  muscleLabel,
} from "./exerciseConstants";

interface Props {
  onOpenExercise: (slug: string) => void;
  onUnauthenticated: () => void;
}

export default function ExerciseCatalog({ onOpenExercise, onUnauthenticated }: Props) {
  const [exercises, setExercises] = useState<ExerciseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [primaryMuscle, setPrimaryMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const requestSequence = useRef(0);

  const hasActiveFilters = search.trim().length > 0 || primaryMuscle !== "" || equipment !== "";

  const clearFilters = () => {
    setSearch("");
    setPrimaryMuscle("");
    setEquipment("");
  };

  const loadExercises = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setError(null);
    try {
      const params: { search?: string; primary_muscle?: string; equipment?: string } = {};
      const trimmed = search.trim();
      if (trimmed) params.search = trimmed;
      if (primaryMuscle) params.primary_muscle = primaryMuscle;
      if (equipment) params.equipment = equipment;

      const data = await fetchExercises(params);
      if (requestId !== requestSequence.current) return;
      setExercises(data);
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      if (requestError instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to load exercises. Please try again.");
    }
  }, [search, primaryMuscle, equipment, onUnauthenticated]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  return (
    <div className="catalog">
      <h2 className="catalog-heading">Exercise catalog</h2>

      <div className="catalog-filters">
        <label className="auth-field">
          <span>Search exercises</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            disabled={exercises === null}
          />
        </label>

        <label className="auth-field">
          <span>Primary muscle</span>
          <select
            value={primaryMuscle}
            onChange={(e) => setPrimaryMuscle(e.target.value)}
            disabled={exercises === null}
          >
            <option value="">All muscle groups</option>
            {MUSCLE_GROUP_FILTERS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="auth-field">
          <span>Equipment</span>
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            disabled={exercises === null}
          >
            <option value="">All equipment</option>
            {EQUIPMENT_FILTERS.map((eq) => (
              <option key={eq.value} value={eq.value}>
                {eq.label}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters && (
          <button type="button" className="auth-cancel" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="catalog-message catalog-error" role="alert">
          <p>{error}</p>
          <button type="button" className="retry" onClick={loadExercises}>
            Retry
          </button>
        </div>
      )}

      {exercises === null && !error && (
        <div className="catalog-message catalog-loading" role="status">
          Loading exercises...
        </div>
      )}

      {exercises !== null && !error && (
        <>
          <p className="catalog-count">
            {exercises.length === 0
              ? "No exercises match your search and filters."
              : `${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`}
          </p>

          {exercises.length === 0 && hasActiveFilters && (
            <button type="button" className="auth-cancel" onClick={clearFilters}>
              Clear filters
            </button>
          )}

          {exercises.length > 0 && (
            <div className="catalog-list">
              {exercises.map((ex) => (
                <button
                  key={ex.slug}
                  type="button"
                  className="catalog-item"
                  onClick={() => onOpenExercise(ex.slug)}
                >
                  <span className="catalog-item-name">{ex.name}</span>
                  <span className="catalog-item-meta">
                    {muscleLabel(ex.primary_muscle)} &middot; {equipmentLabel(ex.equipment)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
