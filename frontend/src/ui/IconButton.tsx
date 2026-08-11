import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./IconButton.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  danger?: boolean;
}

export default function IconButton({
  label,
  danger = false,
  className,
  children,
  ...rest
}: IconButtonProps) {
  const classes = [styles.iconButton, danger ? styles.danger : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}
