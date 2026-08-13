import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createFitnessProfile, fetchFitnessProfile } from "../api";
import { useAuth } from "../context";
import {
  ENVIRONMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  SEX_OPTIONS,
} from "../components/profileConstants";
import Button from "../ui/Button";
import { Field, TextInput, Select, TextArea } from "../ui/Field";
import Alert from "../ui/Alert";
import styles from "./Screen.module.css";
import Section from "../ui/Section";

export default function OnboardingScreen() {
  const { setProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercentage, setBodyFatPercentage] = useState("");
  const [trainingExperience, setTrainingExperience] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState("");
  const [preferredDuration, setPreferredDuration] = useState("");
  const [trainingEnvironment, setTrainingEnvironment] = useState("");
  const [physicalLimitations, setPhysicalLimitations] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit =
    dateOfBirth.trim().length > 0 &&
    biologicalSex !== "" &&
    heightCm.trim().length > 0 &&
    weightKg.trim().length > 0 &&
    trainingExperience !== "" &&
    primaryGoal !== "" &&
    trainingDaysPerWeek.trim().length > 0 &&
    preferredDuration.trim().length > 0 &&
    trainingEnvironment !== "" &&
    !pending;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const payload: Record<string, unknown> = {
        date_of_birth: dateOfBirth,
        biological_sex: biologicalSex,
        height_cm: parseFloat(heightCm),
        weight_kg: parseFloat(weightKg),
        training_experience: trainingExperience,
        primary_goal: primaryGoal,
        training_days_per_week: parseInt(trainingDaysPerWeek, 10),
        preferred_workout_duration_minutes: parseInt(preferredDuration, 10),
        training_environment: trainingEnvironment,
      };
      const bf = bodyFatPercentage.trim();
      if (bf.length > 0) {
        payload.body_fat_percentage = parseFloat(bf);
      }
      const limitations = physicalLimitations.trim();
      if (limitations.length > 0) {
        payload.physical_limitations = limitations;
      }

      const result = await createFitnessProfile(payload);
      if ("detail" in result) {
        if (result.detail === "Fitness profile already exists") {
          const existingProfile = await fetchFitnessProfile();
          if (existingProfile) {
            setProfile(existingProfile);
            navigate("/plan", { replace: true });
            return;
          }
        }
        setError(result.detail);
      } else {
        setProfile(result);
        navigate("/plan", { replace: true });
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.stack6}>
      <div>
        <h2 className={styles.screenTitle}>Set up your fitness profile</h2>
        <p className={styles.textBodyMuted}>This helps FormCadence understand your training context</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Section title="Body">
        <div className={styles.stack4}>
          <Field htmlFor="dob" label="Date of birth" required>
            <TextInput
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="bio-sex" label="Biological sex" required>
            <Select
              id="bio-sex"
              value={biologicalSex}
              onChange={(e) => setBiologicalSex(e.target.value)}
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

          <Field htmlFor="height" label="Height (cm)" required>
            <TextInput
              id="height"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={50}
              max={250}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="weight" label="Body weight (kg)" required>
            <TextInput
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={20}
              max={500}
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="body-fat" label="Body fat percentage" optional>
            <TextInput
              id="body-fat"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={2}
              max={75}
              value={bodyFatPercentage}
              onChange={(e) => setBodyFatPercentage(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>
      </Section>

      <Section title="Training">
        <div className={styles.stack4}>
          <Field htmlFor="experience" label="Training experience" required>
            <Select
              id="experience"
              value={trainingExperience}
              onChange={(e) => setTrainingExperience(e.target.value)}
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

          <Field htmlFor="goal" label="Primary fitness goal" required>
            <Select
              id="goal"
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
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

          <Field htmlFor="days-per-week" label="Training days per week" required>
            <TextInput
              id="days-per-week"
              type="number"
              inputMode="numeric"
              step="1"
              min={1}
              max={7}
              value={trainingDaysPerWeek}
              onChange={(e) => setTrainingDaysPerWeek(e.target.value)}
              required
              disabled={pending}
            />
          </Field>

          <Field htmlFor="duration" label="Preferred workout duration (minutes)" required>
            <TextInput
              id="duration"
              type="number"
              inputMode="numeric"
              step="5"
              min={15}
              max={300}
              value={preferredDuration}
              onChange={(e) => setPreferredDuration(e.target.value)}
              required
              disabled={pending}
            />
          </Field>
        </div>
      </Section>

      <Section title="Preferences and constraints">
        <div className={styles.stack4}>
          <Field htmlFor="environment" label="Training environment" required>
            <Select
              id="environment"
              value={trainingEnvironment}
              onChange={(e) => setTrainingEnvironment(e.target.value)}
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

          <Field htmlFor="limitations" label="Physical limitations" optional>
            <TextArea
              id="limitations"
              value={physicalLimitations}
              onChange={(e) => setPhysicalLimitations(e.target.value)}
              maxLength={1000}
              rows={3}
              disabled={pending}
            />
          </Field>
        </div>
      </Section>

      <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
        {pending ? "Saving profile..." : "Complete profile"}
      </Button>
      <Button type="button" variant="ghost" fullWidth onClick={handleLogout} disabled={pending}>
        Log out
      </Button>
    </form>
  );
}
