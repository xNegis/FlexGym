import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchExercise, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { ExerciseDetail } from "../types";
import {
  equipmentLabel,
  executionTypeLabel,
  movementPatternLabel,
  muscleLabel,
} from "../components/exerciseConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Section, { KeyValueList } from "../ui/Section";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import styles from "./Screen.module.css";

export default function ExerciseDetailScreen() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const catalogSearch =
    typeof (location.state as { catalogSearch?: unknown } | null)?.catalogSearch === "string"
      ? (location.state as { catalogSearch: string }).catalogSearch
      : "";
  const catalogPath = `/exercises${catalogSearch}`;

  const [exercise, setExercise] = useState<ExerciseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
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
        logout();
        return;
      }
      setError("Unable to load exercise. Please try again.");
    }
  }, [slug, logout]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <>
        <AppHeader title="Exercise not found" showBack onBack={() => navigate(catalogPath)} />
        <Page width="reading">
          <p className={`${styles.textBodyMuted} ${styles.mb4}`}>
            The exercise you are looking for does not exist.
          </p>
          <Button variant="secondary" onClick={() => navigate(catalogPath)}>
            Back to catalog
          </Button>
        </Page>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AppHeader title="Exercise" showBack onBack={() => navigate(catalogPath)} />
        <Page width="reading">
          <Alert variant="error">
            <div className={styles.stack2}>
              <span>{error}</span>
            </div>
          </Alert>
          <div className={styles.notFoundActions}>
            <Button variant="secondary" size="small" onClick={load}>
              Retry
            </Button>
            <Button variant="ghost" onClick={() => navigate(catalogPath)}>
              Back to catalog
            </Button>
          </div>
        </Page>
      </>
    );
  }

  if (exercise === null) {
    return (
      <>
        <AppHeader title="Exercise" showBack onBack={() => navigate(catalogPath)} />
        <Page width="reading">
          <LoadingState label="Loading exercise..." />
        </Page>
      </>
    );
  }

  const secondaryMusclesText =
    exercise.secondary_muscles.length > 0
      ? exercise.secondary_muscles.map(muscleLabel).join(", ")
      : "None";

  return (
    <>
      <AppHeader title={exercise.name} showBack onBack={() => navigate(catalogPath)} />
      <Page width="reading">
        <Section title="Instructions">
          <p className={styles.preWrap}>{exercise.instructions}</p>
        </Section>

        <Section title="Details">
          <KeyValueList
            items={[
              { label: "Primary muscle", value: muscleLabel(exercise.primary_muscle) },
              { label: "Secondary muscles", value: secondaryMusclesText },
              { label: "Equipment", value: equipmentLabel(exercise.equipment) },
              { label: "Movement pattern", value: movementPatternLabel(exercise.movement_pattern) },
              { label: "Execution type", value: executionTypeLabel(exercise.execution_type) },
            ]}
          />
        </Section>
      </Page>
    </>
  );
}
