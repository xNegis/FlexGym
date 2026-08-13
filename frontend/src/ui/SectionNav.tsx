import { Link } from "react-router-dom";
import styles from "./SectionNav.module.css";

export interface SectionNavItem {
  value: string;
  label: string;
  to: string;
  active: boolean;
}

interface SectionNavProps {
  label: string;
  items: SectionNavItem[];
}

export default function SectionNav({ label, items }: SectionNavProps) {
  return (
    <nav className={styles.nav} aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.value}
          to={item.to}
          className={`${styles.item} ${item.active ? styles.itemActive : ""}`}
          aria-current={item.active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
