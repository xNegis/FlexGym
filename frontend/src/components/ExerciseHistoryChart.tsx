import { useEffect, useId, useRef, useState } from "react";
import type { ExerciseHistorySet } from "../types";
import styles from "./ExerciseHistoryChart.module.css";

export interface ExerciseHistoryPoint {
  workoutId: number;
  date: string;
  value: number | null;
  status: "completed" | "cancelled";
  sessionName: string;
  sets: ExerciseHistorySet[];
}

interface ExerciseHistoryChartProps {
  title: string;
  unit: "reps" | "kg";
  points: ExerciseHistoryPoint[];
}

const CHART_HEIGHT = 200;
const PAD_LEFT = 64;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;
const DOT_RADIUS = 4;

function formatValue(unit: "reps" | "kg", value: number): string {
  return unit === "reps" ? `${Math.round(value)}` : `${Number(value.toFixed(1))}`;
}

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatSetDetail(set: ExerciseHistorySet): string {
  const facts = [`${set.performed_reps} reps`];
  if (set.performed_weight_kg !== null) {
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

export default function ExerciseHistoryChart({ title, unit, points }: ExerciseHistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelected(null);
  }, [points]);

  const plotWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  let min = unit === "reps" ? 0 : values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  if (unit === "reps" && max <= 0) {
    max = 1;
  } else if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.1);
    min -= padding;
    max += padding;
  }

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? PAD_LEFT + plotWidth / 2
        : PAD_LEFT + (index / (points.length - 1)) * plotWidth;
    if (point.value === null) return null;
    const y = PAD_TOP + plotHeight - ((point.value - min) / (max - min)) * plotHeight;
    return { x, y };
  });

  const lineSegments = coords.reduce<Array<Array<{ x: number; y: number }>>>((segments, coord) => {
    if (coord === null) {
      if (segments.at(-1)?.length === 0) segments.pop();
      segments.push([]);
    } else {
      if (segments.length === 0) segments.push([]);
      segments[segments.length - 1].push(coord);
    }
    return segments;
  }, []);
  const selectedPoint = selected !== null ? points[selected] : null;
  const selectedCoord = selected !== null ? coords[selected] : null;

  return (
    <div ref={containerRef} className={styles.container}>
      <h3 id={titleId} className={styles.title}>
        {title}
      </h3>
      <div className={styles.plot} style={{ height: CHART_HEIGHT }}>
        {width > 0 && (
          <>
            <svg
              className={styles.svg}
              width={width}
              height={CHART_HEIGHT}
              aria-hidden="true"
              focusable="false"
            >
              <line
                className={styles.axisLine}
                x1={PAD_LEFT}
                y1={PAD_TOP}
                x2={PAD_LEFT}
                y2={PAD_TOP + plotHeight}
              />
              <line
                className={styles.axisLine}
                x1={PAD_LEFT}
                y1={PAD_TOP + plotHeight}
                x2={PAD_LEFT + plotWidth}
                y2={PAD_TOP + plotHeight}
              />
              <text className={styles.axisText} x={PAD_LEFT - 6} y={PAD_TOP + 4} textAnchor="end">
                {formatValue(unit, max)} {unit}
              </text>
              <text
                className={styles.axisText}
                x={PAD_LEFT - 6}
                y={PAD_TOP + plotHeight + 4}
                textAnchor="end"
              >
                {formatValue(unit, min)} {unit}
              </text>
              {points.length > 0 && (
                <text
                  className={styles.axisText}
                  x={PAD_LEFT}
                  y={CHART_HEIGHT - 8}
                  textAnchor="start"
                >
                  {formatShortDate(points[0].date)}
                </text>
              )}
              {points.length > 1 && (
                <text
                  className={styles.axisText}
                  x={PAD_LEFT + plotWidth}
                  y={CHART_HEIGHT - 8}
                  textAnchor="end"
                >
                  {formatShortDate(points[points.length - 1].date)}
                </text>
              )}
              {lineSegments.map(
                (segment, index) =>
                  segment.length >= 2 && (
                    <polyline
                      key={index}
                      className={styles.line}
                      points={segment.map((coord) => `${coord.x},${coord.y}`).join(" ")}
                      fill="none"
                    />
                  ),
              )}
              {coords.map(
                (coord, index) =>
                  coord !== null && (
                    <circle
                      key={points[index].workoutId}
                      className={styles.dot}
                      cx={coord.x}
                      cy={coord.y}
                      r={DOT_RADIUS}
                    />
                  ),
              )}
            </svg>
            {coords.map((coord, index) => {
              if (coord === null) return null;
              const point = points[index];
              if (point.value === null) return null;
              const statusLabel = point.status === "completed" ? "Completed" : "Cancelled";
              const label = `${formatShortDate(point.date)}, ${formatValue(unit, point.value)} ${unit}, ${statusLabel}, ${point.sessionName}`;
              return (
                <button
                  key={point.workoutId}
                  type="button"
                  className={`${styles.point} ${selected === index ? styles.pointSelected : ""}`}
                  style={{ left: coord.x, top: coord.y }}
                  aria-label={label}
                  onFocus={() => setSelected(index)}
                  onClick={() => setSelected(index)}
                />
              );
            })}
          </>
        )}
      </div>
      <div className={styles.detail} aria-live="polite">
        {selectedPoint && selectedPoint.value !== null && selectedCoord ? (
          <>
            <span className={styles.detailValue}>
              {formatValue(unit, selectedPoint.value)} {unit}
            </span>
            <span className={styles.detailMeta}>
              {formatShortDate(selectedPoint.date)} ·{" "}
              {selectedPoint.status === "completed" ? "Completed" : "Cancelled"} ·{" "}
              {selectedPoint.sessionName}
            </span>
            <div className={styles.detailSets}>
              <span className={styles.detailSetsTitle}>Performed sets</span>
              {groupSetsByOccurrence(selectedPoint.sets).map((occurrence, index, all) => (
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
        ) : (
          <span className={styles.detailMeta}>Select a point to view its details.</span>
        )}
      </div>
    </div>
  );
}
