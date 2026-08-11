import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  clickable?: boolean;
  active?: boolean;
}

export default function Card({
  children,
  clickable = false,
  active = false,
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    clickable ? styles.clickable : "",
    active ? styles.active : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (clickable) {
    return (
      <button type="button" className={classes} {...rest}>
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}

interface CardDivProps {
  children: ReactNode;
  className?: string;
}

export function StaticCard({ children, className }: CardDivProps) {
  return <div className={`${styles.card} ${className ?? ""}`}>{children}</div>;
}
