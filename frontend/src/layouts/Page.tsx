import type { ReactNode } from "react";
import styles from "./Page.module.css";

type PageWidth = "compact" | "reading" | "planning" | "full";

interface PageProps {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}

export default function Page({ children, width = "reading", className }: PageProps) {
  return <div className={`${styles.page} ${styles[width]} ${className ?? ""}`}>{children}</div>;
}
