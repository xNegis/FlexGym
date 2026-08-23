import TimeSeriesChart from "./TimeSeriesChart";
import type { BodyWeightChartItem } from "../types";
import styles from "./BodyWeightChart.module.css";

interface BodyWeightChartProps {
  points: BodyWeightChartItem[];
}

function formatValue(value: number): string {
  return `${Number(value.toFixed(1))}`;
}

function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BodyWeightChart({ points }: BodyWeightChartProps) {
  const byKey = new Map(points.map((point) => [point.measurement_date, point]));

  return (
    <TimeSeriesChart
      title="Body weight"
      unit="kg"
      points={points.map((point) => ({
        key: point.measurement_date,
        date: point.measurement_date,
        value: point.weight_kg,
      }))}
      formatValue={formatValue}
      pointName={(genericPoint) => {
        const point = byKey.get(genericPoint.key);
        if (!point) return "";
        const note = point.note ? `, ${point.note}` : "";
        return `${formatFullDate(point.measurement_date)}, ${formatValue(point.weight_kg)} kg${note}`;
      }}
      renderDetail={(genericPoint) => {
        const point = byKey.get(genericPoint.key);
        if (!point) return null;
        return (
          <>
            <span className={styles.meta}>{formatFullDate(point.measurement_date)}</span>
            <span className={styles.meta}>{point.note ? point.note : "No note recorded"}</span>
          </>
        );
      }}
    />
  );
}
