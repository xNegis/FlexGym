import TimeSeriesChart from "./TimeSeriesChart";
import type { ExerciseHistorySet } from "../types";
import styles from "./ExerciseHistoryChart.module.css";

export interface ExerciseHistoryPoint {
  workoutId: number;
  date: string;
  value: number;
  status: "completed" | "cancelled";
  sessionName: string;
  sets: ExerciseHistorySet[];
}

interface ExerciseHistoryChartProps {
  title: string;
  points: ExerciseHistoryPoint[];
}

function formatValue(value: number): string {
  return `${Number(value.toFixed(1))}`;
}

function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSetDetail(set: ExerciseHistorySet): string {
  const facts = [`${set.performed_reps} reps`];
  if (set.performed_weight_kg !== null && set.performed_weight_kg > 0) {
    facts.push(`${Number(set.performed_weight_kg.toFixed(1))} kg`);
  }
  if (set.performed_rir !== null) {
    facts.push(`RIR ${set.performed_rir}`);
  }
  return `Set ${set.set_position}: ${facts.join(" · ")}`;
}

function groupSetsByOccurrence(sets: ExerciseHistorySet[]): ExerciseHistorySet[][] {
  const occurrences = new Map<number, ExerciseHistorySet[]>();
  for (const set of sets) {
    const group = occurrences.get(set.exercise_position) ?? [];
    group.push(set);
    occurrences.set(set.exercise_position, group);
  }
  return Array.from(occurrences.values());
}

export default function ExerciseHistoryChart({ title, points }: ExerciseHistoryChartProps) {
  const byKey = new Map(points.map((point) => [String(point.workoutId), point]));

  return (
    <TimeSeriesChart
      title={title}
      unit="kg"
      points={points.map((point) => ({
        key: String(point.workoutId),
        date: point.date,
        value: point.value,
      }))}
      formatValue={formatValue}
      pointName={(genericPoint) => {
        const point = byKey.get(genericPoint.key);
        if (!point) return "";
        const statusLabel = point.status === "completed" ? "Completed" : "Cancelled";
        return `${formatFullDate(point.date)}, ${formatValue(point.value)} kg, ${statusLabel}, ${point.sessionName}`;
      }}
      renderDetail={(genericPoint) => {
        const point = byKey.get(genericPoint.key);
        if (!point) return null;
        const statusLabel = point.status === "completed" ? "Completed" : "Cancelled";
        return (
          <>
            <span className={styles.detailMeta}>
              {formatFullDate(point.date)} · {statusLabel} · {point.sessionName}
            </span>
            <div className={styles.detailSets}>
              <span className={styles.detailSetsTitle}>Performed sets</span>
              {groupSetsByOccurrence(point.sets).map((occurrence, index, all) => (
                <div key={occurrence[0].exercise_position}>
                  {all.length > 1 && (
                    <span className={styles.detailOccurrence}>Occurrence {index + 1}</span>
                  )}
                  <ul className={styles.detailSetList}>
                    {occurrence.map((set) => (
                      <li
                        key={`${set.exercise_position}-${set.set_position}`}
                        className={styles.detailSet}
                      >
                        {formatSetDetail(set)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        );
      }}
    />
  );
}
