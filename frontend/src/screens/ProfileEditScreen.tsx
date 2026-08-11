import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context";
import { updateFitnessProfile } from "../api";
import {
  ENVIRONMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  SEX_OPTIONS,
} from "../components/profileConstants";
import type { FitnessProfile } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Section from "../ui/Section";
import { Field, TextInput, Select, TextArea } from "../ui/Field";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import styles from "./Screen.module.css";

function toFormState(profile: FitnessProfile) {
  return {
    dateOfBirth: profile.date_of_birth,
    biologicalSex: profile.biological_sex,
    heightCm: String(profile.height_cm),
    weightKg: String(profile.weight_kg),
    bodyFatPercentage:
      profile.body_fat_percentage != null ? String(profile.body_fat_percentage) : "",
    trainingExperience: profile.training_experience,
    primaryGoal: profile.primary_goal,
    trainingDaysPerWeek: String(profile.training_days_per_week),
    preferredDuration: String(profile.preferred_workout_duration_minutes),
    trainingEnvironment: profile.training_environment,
    physicalLimitations: profile.physical_limitations ?? "",
  };
}

export default function ProfileEditScreen() {
  const { profile, setProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => toFormState(profile!));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit =
    form.dateOfBirth.trim().length > 0 &&
    form.biologicalSex !== "" &&
    form.heightCm.trim().length > 0 &&
    form.weightKg.trim().length > 0 &&
    form.trainingExperience !== "" &&
    form.primaryGoal !== "" &&
    form.trainingDaysPerWeek.trim().length > 0 &&
    form.preferredDuration.trim().length > 0 &&
    form.trainingEnvironment !== "" &&
    !pending;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const payload: Record<string, unknown> = {
        date_of_birth: form.dateOfBirth,
        biological_sex: form.biologicalSex,
        height_cm: parseFloat(form.heightCm),
        weight_kg: parseFloat(form.weightKg),
        training_experience: form.trainingExperience,
        primary_goal: form.primaryGoal,
        training_days_per_week: parseInt(form.trainingDaysPerWeek, 10),
        preferred_workout_duration_minutes: parseInt(form.preferredDuration, 10),
        training_environment: form.trainingEnvironment,
      };
      const bf = form.bodyFatPercentage.trim();
      payload.body_fat_percentage = bf.length > 0 ? parseFloat(bf) : null;
      const limitations = form.physicalLimitations.trim();
      payload.physical_limitations = limitations.length > 0 ? limitations : null;

      const result = await updateFitnessProfile(payload);
      if ("detail" in result) {
        if (result.detail === "Fitness profile not found") {
          await logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(result.detail);
      } else {
        setProfile(result);
        navigate("/profile", { replace: true });
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <AppHeader title="Edit profile" showBack />
      <Page width="reading">
        <form onSubmit={handleSave} noValidate className={styles.stack6}>
          {error && <Alert variant="error">{error}</Alert>}

          <Section title="Body">
            <div className={styles.stack4}>
              <Field htmlFor="edit-dob" label="Date of birth" required>
                <TextInput
                  id="edit-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  required
                  disabled={pending}
                />
              </Field>
              <Field htmlFor="edit-bio-sex" label="Biological sex" required>
                <Select
                  id="edit-bio-sex"
                  value={form.biologicalSex}
                  onChange={(e) => setForm((f) => ({ ...f, biologicalSex: e.target.value }))}
                  required
                  disabled={pending}
                >
                  {SEX_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="edit-height" label="Height (cm)" required>
                <TextInput
                  id="edit-height"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={50}
                  max={250}
                  value={form.heightCm}
                  onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))}
                  required
                  disabled={pending}
                />
              </Field>
              <Field htmlFor="edit-weight" label="Body weight (kg)" required>
                <TextInput
                  id="edit-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={20}
                  max={500}
                  value={form.weightKg}
                  onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                  required
                  disabled={pending}
                />
              </Field>
              <Field htmlFor="edit-body-fat" label="Body fat percentage" optional>
                <TextInput
                  id="edit-body-fat"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={2}
                  max={75}
                  value={form.bodyFatPercentage}
                  onChange={(e) => setForm((f) => ({ ...f, bodyFatPercentage: e.target.value }))}
                  disabled={pending}
                />
              </Field>
            </div>
          </Section>

          <Section title="Training">
            <div className={styles.stack4}>
              <Field htmlFor="edit-experience" label="Training experience" required>
                <Select
                  id="edit-experience"
                  value={form.trainingExperience}
                  onChange={(e) => setForm((f) => ({ ...f, trainingExperience: e.target.value }))}
                  required
                  disabled={pending}
                >
                  {EXPERIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="edit-goal" label="Primary fitness goal" required>
                <Select
                  id="edit-goal"
                  value={form.primaryGoal}
                  onChange={(e) => setForm((f) => ({ ...f, primaryGoal: e.target.value }))}
                  required
                  disabled={pending}
                >
                  {GOAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="edit-days" label="Training days per week" required>
                <TextInput
                  id="edit-days"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={1}
                  max={7}
                  value={form.trainingDaysPerWeek}
                  onChange={(e) => setForm((f) => ({ ...f, trainingDaysPerWeek: e.target.value }))}
                  required
                  disabled={pending}
                />
              </Field>
              <Field htmlFor="edit-duration" label="Preferred workout duration (minutes)" required>
                <TextInput
                  id="edit-duration"
                  type="number"
                  inputMode="numeric"
                  step="5"
                  min={15}
                  max={300}
                  value={form.preferredDuration}
                  onChange={(e) => setForm((f) => ({ ...f, preferredDuration: e.target.value }))}
                  required
                  disabled={pending}
                />
              </Field>
            </div>
          </Section>

          <Section title="Preferences and constraints">
            <div className={styles.stack4}>
              <Field htmlFor="edit-environment" label="Training environment" required>
                <Select
                  id="edit-environment"
                  value={form.trainingEnvironment}
                  onChange={(e) => setForm((f) => ({ ...f, trainingEnvironment: e.target.value }))}
                  required
                  disabled={pending}
                >
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="edit-limitations" label="Physical limitations" optional>
                <TextArea
                  id="edit-limitations"
                  value={form.physicalLimitations}
                  onChange={(e) => setForm((f) => ({ ...f, physicalLimitations: e.target.value }))}
                  maxLength={1000}
                  rows={3}
                  disabled={pending}
                />
              </Field>
            </div>
          </Section>

          <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => navigate("/profile")}
            disabled={pending}
          >
            Cancel
          </Button>
        </form>
      </Page>
    </>
  );
}
