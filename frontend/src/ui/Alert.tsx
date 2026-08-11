import type { ReactNode } from "react";
import styles from "./Alert.module.css";

type AlertVariant = "error" | "warning" | "success" | "info";

interface AlertProps {
  variant: AlertVariant;
  role?: "alert" | "status";
  children: ReactNode;
  className?: string;
}

export default function Alert({
  variant,
  role = variant === "error" ? "alert" : "status",
  children,
  className,
}: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[variant]} ${className ?? ""}`} role={role}>
      {children}
    </div>
  );
}
