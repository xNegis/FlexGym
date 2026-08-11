import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export default function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${className ?? ""}`}>{children}</span>
  );
}
