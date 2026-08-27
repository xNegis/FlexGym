import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWorkoutPreferences, updateWorkoutPreferences, UnauthenticatedError } from "../api";
import { useAuth } from "../context";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Section from "../ui/Section";
import { Field, Select } from "../ui/Field";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Dialog from "../ui/Dialog";
import styles from "./Screen.module.css";

const AUTO_START_OPTIONS = [
  { value: 0, label: "Manual start" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 20, label: "20 seconds" },
  { value: 30, label: "30 seconds" },
];

export default function WorkoutSettingsScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const preference = await fetchWorkoutPreferences();
      setConfirmed(preference.automatic_set_start_delay_seconds);
      setSelected(preference.automatic_set_start_delay_seconds);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setLoadError("Unable to load workout settings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const performSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await updateWorkoutPreferences(selected);
      if ("detail" in result) {
        setError(result.detail);
        return;
      }
      setConfirmed(result.automatic_set_start_delay_seconds);
      setSelected(result.automatic_set_start_delay_seconds);
      setSuccess(true);
      setConfirmOpen(false);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setError("Unable to save workout settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (confirmed === null) return;
    setError(null);
    setSuccess(false);
    if (selected > 0 && confirmed === 0) {
      setConfirmOpen(true);
      return;
    }
    void performSave();
  };

  const handleConfirmSave = () => {
    void performSave();
  };

  const handleChange = (value: number) => {
    setSelected(value);
    setSuccess(false);
    setError(null);
  };

  const header = (
    <AppHeader title="Workout settings" showBack onBack={() => navigate("/profile")} />
  );

  if (loading) {
    return (
      <>
        {header}
        <Page width="reading">
          <p className={styles.textCompactMuted}>Loading workout settings...</p>
        </Page>
      </>
    );
  }

  if (confirmed === null) {
    return (
      <>
        {header}
        <Page width="reading">
          <div className={styles.stack4}>
            <Alert variant="error">{loadError ?? "Unable to load workout settings."}</Alert>
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Page>
      </>
    );
  }

  return (
    <>
      {header}

      <Page width="reading">
        <div className={styles.stack6}>
          <Section
            title="Set start"
            description="Choose whether FormCadence starts the next set of the same exercise automatically after planned rest."
          >
            <Field label="Automatic set start" htmlFor="auto-start-delay">
              <Select
                id="auto-start-delay"
                value={String(selected)}
                onChange={(e) => handleChange(Number(e.target.value))}
                disabled={saving}
              >
                {AUTO_START_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <p className={styles.textCompactMuted}>
              Automatic start applies only between sets of the same exercise. Changes apply to
              workouts started after you save.
            </p>

            {!confirmOpen && success && <Alert variant="success">Workout settings saved.</Alert>}
            {!confirmOpen && error && <Alert variant="error">{error}</Alert>}

            <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </Section>
        </div>
      </Page>

      <Dialog
        open={confirmOpen}
        title="Enable automatic start"
        onClose={() => {
          if (!saving) {
            setConfirmOpen(false);
          }
        }}
        actions={
          <div className={styles.row2}>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmSave} disabled={saving}>
              {saving ? "Saving..." : "Enable automatic start"}
            </Button>
          </div>
        }
      >
        <div className={styles.stack3}>
          <p>
            Automatic start applies only between sets of the same exercise. FormCadence records the
            configured automatic boundary as the set start.
          </p>
          <p>The recorded time may be earlier than your physical first repetition.</p>
          <p>Changes apply only to workouts started after the setting is saved.</p>
          {error && <Alert variant="error">{error}</Alert>}
        </div>
      </Dialog>
    </>
  );
}
