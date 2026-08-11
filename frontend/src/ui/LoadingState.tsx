import type { ReactNode } from "react";
import styles from "./LoadingState.module.css";

interface LoadingStateProps {
  label?: string;
  children?: ReactNode;
}

export function LoadingState({ label = "Loading...", children }: LoadingStateProps) {
  if (children) return <div>{children}</div>;
  return (
    <div className={styles.loadingState} role="status">
      <div className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
  pulse?: boolean;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  className,
  pulse = true,
}: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${pulse ? styles.skeletonPulse : ""} ${className ?? ""}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
