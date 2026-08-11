import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoutine } from "../api";
import { OBJECTIVE_OPTIONS } from "../components/routineConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import { Field, TextInput, Select, TextArea } from "../ui/Field";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import styles from "./Screen.module.css";

export default function RoutineCreateScreen() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = name.trim().length > 0 && objective !== "" && !pending;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const desc = description.trim();
      const result = await createRoutine({
        name: name.trim(),
        objective,
        description: desc.length > 0 ? desc : null,
      });
      if ("detail" in result) {
        setError(result.detail);
      } else {
        navigate(`/plan/routines/${result.id}`, { replace: true });
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <AppHeader title="Create routine" showBack />
      <Page width="reading">
        <form onSubmit={handleSubmit} noValidate className={styles.stack5}>
          {error && <Alert variant="error">{error}</Alert>}

          <Field htmlFor="routine-name" label="Name" required>
            <TextInput
              id="routine-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              disabled={pending}
              placeholder="e.g. Push Pull Legs"
            />
          </Field>

          <Field htmlFor="routine-objective" label="Objective" required>
            <Select
              id="routine-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              required
              disabled={pending}
            >
              {OBJECTIVE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="routine-desc" label="Description" optional>
            <TextArea
              id="routine-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              disabled={pending}
            />
          </Field>

          <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
            {pending ? "Creating..." : "Create routine"}
          </Button>
        </form>
      </Page>
    </>
  );
}
