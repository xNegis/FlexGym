import { useCallback, useEffect, useState } from "react";
import { fetchExercise, UnauthenticatedError } from "../api";
import type { ExerciseDetail } from "../types";
import {
  equipmentLabel,
  executionTypeLabel,
  movementPatternLabel,
  muscleLabel,
} from "./exerciseConstants";

interface Props {
  slug: string;
  onBack: () => void;
  onUnauthenticated: () => void;
}

export default function ExerciseDetail({ slug, onBack, onUnauthenticated }: Props) {
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchExercise(slug);
      if ("notFound" in result) {
        setNotFound(true);
        setExercise(null);
      } else {
        setExercise(result);
      }
    } catch (requestError) {
      if (requestError instanceof UnauthenticatedError) {
        onUnauthenticated();
        return;
      }
      setError("Unable to load exercise. Please try again.");
    }
  }, [slug, onUnauthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <div className="detail">
        <h2 className="detail-heading">Exercise not found</h2>
        <button type="button" className="auth-button" onClick={onBack}>
          Back to catalog
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail">
        <div className="catalog-message catalog-error" role="alert">
          <p>{error}</p>
        </div>
        <div className="detail-actions">
          <button type="button" className="retry" onClick={load}>
            Retry
          </button>
          <button type="button" className="auth-cancel" onClick={onBack}>
            Back to catalog
          </button>
        </div>
      </div>
    );
  }

  if (exercise === null) {
    return (
      <div className="detail">
        <div className="catalog-message catalog-loading" role="status">
          Loading exercise...
        </div>
      </div>
    );
  }

  const secondaryMusclesText =
    exercise.secondary_muscles.length > 0
      ? exercise.secondary_muscles.map(muscleLabel).join(", ")
      : "None";

  return (
    <div className="detail">
      <h2 className="detail-heading">{exercise.name}</h2>

      <div className="detail-section">
        <div className="profile-row">
          <span className="profile-label">Primary muscle</span>
          <span className="profile-value">{muscleLabel(exercise.primary_muscle)}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Secondary muscles</span>
          <span className="profile-value">{secondaryMusclesText}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Equipment</span>
          <span className="profile-value">{equipmentLabel(exercise.equipment)}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Movement pattern</span>
          <span className="profile-value">{movementPatternLabel(exercise.movement_pattern)}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">Execution type</span>
          <span className="profile-value">{executionTypeLabel(exercise.execution_type)}</span>
        </div>
      </div>

      <div className="detail-instructions">
        <h3 className="detail-instructions-heading">Instructions</h3>
        <p>{exercise.instructions}</p>
      </div>

      <button type="button" className="auth-button" onClick={onBack}>
        Back to catalog
      </button>
    </div>
  );
}
