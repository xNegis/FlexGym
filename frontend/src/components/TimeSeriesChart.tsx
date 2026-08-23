import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./TimeSeriesChart.module.css";

export interface TimeSeriesPoint {
  key: string;
  date: string;
  value: number;
}

interface TimeSeriesChartProps<T extends TimeSeriesPoint> {
  title: string;
  unit: string;
  points: T[];
  formatValue: (value: number) => string;
  pointName: (point: T) => string;
  renderDetail: (point: T) => ReactNode;
}

const CHART_HEIGHT = 200;
const PAD_LEFT = 64;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;
const DOT_RADIUS = 4;

function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function TimeSeriesChart<T extends TimeSeriesPoint>({
  title,
  unit,
  points,
  formatValue,
  pointName,
  renderDetail,
}: TimeSeriesChartProps<T>) {
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

  const pointsKey = JSON.stringify(points.map(({ key, date, value }) => [key, date, value]));
  const previousPointsKey = useRef(pointsKey);

  useEffect(() => {
    if (previousPointsKey.current !== pointsKey) {
      previousPointsKey.current = pointsKey;
      setSelected(null);
    }
  }, [pointsKey]);

  const plotWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const values = points.map((point) => point.value);
  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min;
  const padding = span === 0 ? Math.max(1, Math.abs(min) * 0.1) : span * 0.1;
  min -= padding;
  max += padding;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? PAD_LEFT + plotWidth / 2
        : PAD_LEFT + (index / (points.length - 1)) * plotWidth;
    const y = PAD_TOP + plotHeight - ((point.value - min) / (max - min)) * plotHeight;
    return { x, y };
  });

  const lineSegments = coords.reduce<Array<Array<{ x: number; y: number }>>>((segments, coord) => {
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1].push(coord);
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
                {formatValue(max)} {unit}
              </text>
              <text
                className={styles.axisText}
                x={PAD_LEFT - 6}
                y={PAD_TOP + plotHeight + 4}
                textAnchor="end"
              >
                {formatValue(min)} {unit}
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
              {coords.map((coord, index) => (
                <circle
                  key={points[index].key}
                  className={styles.dot}
                  cx={coord.x}
                  cy={coord.y}
                  r={DOT_RADIUS}
                />
              ))}
            </svg>
            {coords.map((coord, index) => {
              const point = points[index];
              return (
                <button
                  key={point.key}
                  type="button"
                  className={`${styles.point} ${selected === index ? styles.pointSelected : ""}`}
                  style={{ left: coord.x, top: coord.y }}
                  aria-label={pointName(point)}
                  onFocus={() => setSelected(index)}
                  onClick={() => setSelected(index)}
                />
              );
            })}
          </>
        )}
      </div>
      <div className={styles.detail} aria-live="polite">
        {selectedPoint && selectedCoord ? (
          <>
            <span className={styles.detailValue}>
              {formatValue(selectedPoint.value)} {unit}
            </span>
            {renderDetail(selectedPoint)}
          </>
        ) : (
          <span className={styles.detailMeta}>Select a point to view its details.</span>
        )}
      </div>
    </div>
  );
}
