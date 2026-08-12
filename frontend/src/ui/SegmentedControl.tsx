import styles from "./SegmentedControl.module.css";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  name: string;
  label: string;
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
}

export default function SegmentedControl<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.group}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`${styles.segment} ${selected ? styles.segmentSelected : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className={styles.input}
              />
              <span className={styles.segmentLabel}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
