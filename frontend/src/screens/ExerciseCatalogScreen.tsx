import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { fetchExercises, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import type { ExerciseSummary } from "../types";
import {
  EQUIPMENT_FILTERS,
  MUSCLE_GROUP_FILTERS,
  equipmentLabel,
  muscleLabel,
} from "../components/exerciseConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import { Field, TextInput, Select } from "../ui/Field";
import Alert from "../ui/Alert";
import { LoadingState } from "../ui/LoadingState";
import EmptyState from "../ui/EmptyState";
import { ChevronRight, Dumbbell } from "lucide-react";
import styles from "./Screen.module.css";

export default function ExerciseCatalogScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();

  const [exercises, setExercises] = useState<ExerciseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [primaryMuscle, setPrimaryMuscle] = useState(() => searchParams.get("muscle") ?? "");
  const [equipment, setEquipment] = useState(() => searchParams.get("equipment") ?? "");
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
        logout();
        return;
      }
      setError("Unable to load exercises. Please try again.");
    }
  }, [search, primaryMuscle, equipment, logout]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim());
    if (primaryMuscle) next.set("muscle", primaryMuscle);
    if (equipment) next.set("equipment", equipment);
    setSearchParams(next, { replace: true });
  }, [search, primaryMuscle, equipment, setSearchParams]);

  return (
    <>
      <AppHeader title="Exercise catalog" />
      <Page width="reading">
        <div className={styles.mb4}>
          <Field htmlFor="catalog-search" label="Search exercises">
            <TextInput
              id="catalog-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              disabled={exercises === null}
              placeholder="Search by exercise name..."
            />
          </Field>
        </div>

        <div className={`${styles.fieldGrid} ${styles.mb4}`}>
          <div className={styles.flex1}>
            <Field htmlFor="catalog-muscle" label="Primary muscle">
              <Select
                id="catalog-muscle"
                value={primaryMuscle}
                onChange={(e) => setPrimaryMuscle(e.target.value)}
                disabled={exercises === null}
              >
                <option value="">All muscles</option>
                {MUSCLE_GROUP_FILTERS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className={styles.flex1}>
            <Field htmlFor="catalog-equipment" label="Equipment">
              <Select
                id="catalog-equipment"
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
              </Select>
            </Field>
          </div>
        </div>

        {hasActiveFilters && (
          <div className={`${styles.rowWrap2} ${styles.mb4}`}>
            {search.trim() && <Badge variant="accent">Search: {search.trim()}</Badge>}
            {primaryMuscle && <Badge variant="accent">{muscleLabel(primaryMuscle)}</Badge>}
            {equipment && <Badge variant="accent">{equipmentLabel(equipment)}</Badge>}
            <Button variant="ghost" size="small" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}

        {error && (
          <div className={styles.mb4}>
            <Alert variant="error">
              <div className={styles.stack2}>
                <span>{error}</span>
                <Button variant="secondary" size="small" onClick={loadExercises}>
                  Retry
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {exercises === null && !error && <LoadingState label="Loading exercises..." />}

        {exercises !== null && !error && (
          <>
            <p className={`${styles.textCompactMuted} ${styles.mb4}`}>
              {exercises.length === 0
                ? "No exercises match your search and filters."
                : `${exercises.length} ${exercises.length === 1 ? "exercise" : "exercises"}`}
            </p>

            {exercises.length === 0 && !hasActiveFilters && (
              <EmptyState
                icon={<Dumbbell size={32} />}
                title="No exercises available"
                description="The exercise catalog is empty. This should not happen in a normal installation."
              />
            )}

            {exercises.length === 0 && hasActiveFilters && (
              <EmptyState
                title="No matching exercises"
                description="Try adjusting your search or filters."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            )}

            {exercises.length > 0 && (
              <div className={styles.stack2}>
                {exercises.map((ex) => (
                  <Card
                    key={ex.slug}
                    clickable
                    onClick={() =>
                      navigate(`/exercises/${ex.slug}`, {
                        state: { catalogSearch: location.search },
                      })
                    }
                    className={styles.cardLink}
                  >
                    <div>
                      <div className={styles.cardTitle}>{ex.name}</div>
                      <div className={styles.cardMeta}>
                        {muscleLabel(ex.primary_muscle)} &middot; {equipmentLabel(ex.equipment)}
                      </div>
                    </div>
                    <ChevronRight size={16} aria-hidden="true" className={styles.chevron} />
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </Page>
    </>
  );
}
