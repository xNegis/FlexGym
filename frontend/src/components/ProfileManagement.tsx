import { type FormEvent, useState } from "react";
import { deleteFitnessProfile, logout, updateFitnessProfile } from "../api";
import {
  ENVIRONMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  SEX_OPTIONS,
  labelFor,
} from "./profileConstants";
import type { FitnessProfile } from "../types";

interface Props {
  profile: FitnessProfile;
  email: string;
  onLoggedOut: () => void;
  onProfileDeleted: () => void;
  onProfileUpdated: (updated: FitnessProfile) => void;
}

type ViewMode = "summary" | "edit" | "delete";

interface FormState {
  dateOfBirth: string;
  biologicalSex: string;
  heightCm: string;
  weightKg: string;
  bodyFatPercentage: string;
  trainingExperience: string;
  primaryGoal: string;
  trainingDaysPerWeek: string;
  preferredDuration: string;
  trainingEnvironment: string;
  physicalLimitations: string;
}

function toFormState(profile: FitnessProfile): FormState {
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

function optionalValue(value: string | number | null): string {
  if (value === null || value === "") return "Not provided";
  return String(value);
}

export default function ProfileManagement({
  profile: savedProfile,
  email,
  onLoggedOut,
  onProfileDeleted,
  onProfileUpdated,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [form, setForm] = useState<FormState>(toFormState(savedProfile));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const handleLogout = async () => {
    setError(null);
    setLogoutPending(true);
    try {
      await logout();
      onLoggedOut();
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      setLogoutPending(false);
    }
  };

  // -- Edit mode ----------------------------------------------------------

  const enterEdit = () => {
    setForm(toFormState(savedProfile));
    setError(null);
    setViewMode("edit");
  };

  const cancelEdit = () => {
    setViewMode("summary");
    setError(null);
  };

  const finishMissingProfile = async () => {
    try {
      await logout();
      onProfileDeleted();
    } catch {
      setError("Your profile no longer exists, but you could not be logged out. Please try again.");
    }
  };

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
          await finishMissingProfile();
          return;
        }
        setError(result.detail);
      } else {
        onProfileUpdated(result);
        setViewMode("summary");
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  // -- Delete confirmation ------------------------------------------------

  const enterDelete = () => {
    setError(null);
    setViewMode("delete");
  };

  const cancelDelete = () => {
    setViewMode("summary");
    setError(null);
  };

  const handleDelete = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await deleteFitnessProfile();
      if (result !== null) {
        if (result.detail === "Fitness profile not found") {
          await finishMissingProfile();
          return;
        }
        setError(result.detail);
      } else {
        onProfileDeleted();
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  // -- Summary view -------------------------------------------------------

  if (viewMode === "summary") {
    return (
      <div className="profile-management">
        <h2 className="auth-title">Your fitness profile</h2>

        <div className="profile-summary">
          <div className="profile-row">
            <span className="profile-label">Date of birth</span>
            <span className="profile-value">{savedProfile.date_of_birth}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Biological sex</span>
            <span className="profile-value">{labelFor(savedProfile.biological_sex)}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Height</span>
            <span className="profile-value">{savedProfile.height_cm} cm</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Body weight</span>
            <span className="profile-value">{savedProfile.weight_kg} kg</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Body fat percentage</span>
            <span className="profile-value">
              {savedProfile.body_fat_percentage === null
                ? "Not provided"
                : `${savedProfile.body_fat_percentage}%`}
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Training experience</span>
            <span className="profile-value">{labelFor(savedProfile.training_experience)}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Primary fitness goal</span>
            <span className="profile-value">{labelFor(savedProfile.primary_goal)}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Training days per week</span>
            <span className="profile-value">{savedProfile.training_days_per_week}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Preferred workout duration</span>
            <span className="profile-value">
              {savedProfile.preferred_workout_duration_minutes} min
            </span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Training environment</span>
            <span className="profile-value">{labelFor(savedProfile.training_environment)}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">Physical limitations</span>
            <span className="profile-value">
              {optionalValue(savedProfile.physical_limitations)}
            </span>
          </div>
        </div>

        <p className="profile-email">{email}</p>

        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <button type="button" className="auth-button" onClick={enterEdit}>
          Edit profile
        </button>
        <button type="button" className="auth-delete-button" onClick={enterDelete}>
          Delete profile
        </button>
        <button
          type="button"
          className="auth-logout"
          onClick={handleLogout}
          disabled={logoutPending}
        >
          {logoutPending ? "Logging out..." : "Log out"}
        </button>
      </div>
    );
  }

  // -- Edit form view -----------------------------------------------------

  if (viewMode === "edit") {
    return (
      <form className="profile-form" onSubmit={handleSave} noValidate>
        <h2 className="auth-title">Edit profile</h2>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}

        <label className="auth-field">
          <span>Date of birth</span>
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            required
            disabled={pending}
          />
        </label>

        <label className="auth-field">
          <span>Biological sex</span>
          <select
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
            value={form.heightCm}
            onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))}
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
            value={form.weightKg}
            onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
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
            value={form.bodyFatPercentage}
            onChange={(e) => setForm((f) => ({ ...f, bodyFatPercentage: e.target.value }))}
            disabled={pending}
          />
        </label>

        <label className="auth-field">
          <span>Training experience</span>
          <select
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
          </select>
        </label>

        <label className="auth-field">
          <span>Primary fitness goal</span>
          <select
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
            value={form.trainingDaysPerWeek}
            onChange={(e) => setForm((f) => ({ ...f, trainingDaysPerWeek: e.target.value }))}
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
            value={form.preferredDuration}
            onChange={(e) => setForm((f) => ({ ...f, preferredDuration: e.target.value }))}
            required
            disabled={pending}
          />
        </label>

        <label className="auth-field">
          <span>Training environment</span>
          <select
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
          </select>
        </label>

        <label className="auth-field">
          <span>Physical limitations (optional)</span>
          <textarea
            value={form.physicalLimitations}
            onChange={(e) => setForm((f) => ({ ...f, physicalLimitations: e.target.value }))}
            maxLength={1000}
            rows={3}
            disabled={pending}
          />
        </label>

        <button type="submit" className="auth-button" disabled={!canSubmit}>
          {pending ? "Saving..." : "Save"}
        </button>
        <button type="button" className="auth-cancel" onClick={cancelEdit} disabled={pending}>
          Cancel
        </button>
      </form>
    );
  }

  // -- Delete confirmation ------------------------------------------------

  return (
    <div className="profile-management">
      <h2 className="auth-title">Delete profile</h2>

      <div className="delete-confirmation">
        <p>
          Are you sure you want to delete your fitness profile? This will permanently remove all
          saved profile data and sign you out. You will need to log in and complete onboarding
          again.
        </p>
      </div>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <button
        type="button"
        className="auth-delete-confirm-button"
        onClick={handleDelete}
        disabled={pending}
      >
        {pending ? "Deleting..." : "Delete profile"}
      </button>
      <button type="button" className="auth-cancel" onClick={cancelDelete} disabled={pending}>
        Cancel
      </button>
    </div>
  );
}
