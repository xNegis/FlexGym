import { type FormEvent, useState } from "react";
import { createFitnessProfile, fetchFitnessProfile, logout } from "../api";
import {
  ENVIRONMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  SEX_OPTIONS,
} from "./profileConstants";
import type { FitnessProfile } from "../types";

interface Props {
  onProfileCreated: (profile: FitnessProfile) => void;
  onLoggedOut: () => void;
}

export default function FitnessProfileForm({ onProfileCreated, onLoggedOut }: Props) {
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
            onProfileCreated(existingProfile);
            return;
          }
        }
        setError(result.detail);
      } else {
        onProfileCreated(result);
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    setPending(true);
    try {
      await logout();
      onLoggedOut();
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit} noValidate>
      <h2 className="auth-title">Set up your fitness profile</h2>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <label className="auth-field">
        <span>Date of birth</span>
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          required
          disabled={pending}
        />
      </label>

      <label className="auth-field">
        <span>Biological sex</span>
        <select
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
        </select>
      </label>

      <label className="auth-field">
        <span>Height (cm)</span>
        <input
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
      </label>

      <label className="auth-field">
        <span>Body weight (kg)</span>
        <input
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
      </label>

      <label className="auth-field">
        <span>Body fat percentage (optional)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={2}
          max={75}
          value={bodyFatPercentage}
          onChange={(e) => setBodyFatPercentage(e.target.value)}
          disabled={pending}
        />
      </label>

      <label className="auth-field">
        <span>Training experience</span>
        <select
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
        </select>
      </label>

      <label className="auth-field">
        <span>Primary fitness goal</span>
        <select
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
        </select>
      </label>

      <label className="auth-field">
        <span>Training days per week</span>
        <input
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
      </label>

      <label className="auth-field">
        <span>Preferred workout duration (minutes)</span>
        <input
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
      </label>

      <label className="auth-field">
        <span>Training environment</span>
        <select
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
        </select>
      </label>

      <label className="auth-field">
        <span>Physical limitations (optional)</span>
        <textarea
          value={physicalLimitations}
          onChange={(e) => setPhysicalLimitations(e.target.value)}
          maxLength={1000}
          rows={3}
          disabled={pending}
        />
      </label>

      <button type="submit" className="auth-button" disabled={!canSubmit}>
        {pending ? "Saving profile..." : "Complete profile"}
      </button>
      <button type="button" className="auth-logout" onClick={handleLogout} disabled={pending}>
        Log out
      </button>
    </form>
  );
}
