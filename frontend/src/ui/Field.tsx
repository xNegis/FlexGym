import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cloneElement, isValidElement, type ReactElement } from "react";
import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}

export function Field({
  label,
  required = false,
  optional = false,
  hint,
  error,
  htmlFor,
  children,
}: FieldProps) {
  const hintId = hint && !error ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = errorId ?? hintId;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
        "aria-invalid": error ? "true" : undefined,
      })
    : children;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        )}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {control}
      {hint && !error && (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className={styles.error} id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  error?: string;
}

export function TextInput({ id, error, className, ...rest }: TextInputProps) {
  const classes = [styles.input, error ? styles.inputError : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      id={id}
      className={classes}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...rest}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
}

export function Select({ id, className, children, ...rest }: SelectProps) {
  return (
    <select id={id} className={`${styles.select} ${className ?? ""}`} {...rest}>
      {children}
    </select>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
}

export function TextArea({ id, className, ...rest }: TextAreaProps) {
  return <textarea id={id} className={`${styles.textarea} ${className ?? ""}`} {...rest} />;
}
