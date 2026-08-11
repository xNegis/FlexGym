import type { ReactNode } from "react";
import styles from "./Section.module.css";

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export default function Section({ title, description, children, className }: SectionProps) {
  return (
    <section className={`${styles.section} ${className ?? ""}`}>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </section>
  );
}

export function Divider() {
  return <hr className={styles.divider} />;
}

interface KeyValueListProps {
  items: { label: string; value: ReactNode }[];
}

export function KeyValueList({ items }: KeyValueListProps) {
  return (
    <dl className={styles.keyValueList}>
      {items.map((item) => (
        <div key={item.label} className={styles.keyValueRow}>
          <dt className={styles.keyLabel}>{item.label}</dt>
          <dd className={styles.keyValue}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
