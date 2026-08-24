import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context";
import {
  deleteFitnessProfile,
  fetchWorkoutPreferences,
  logout as apiLogout,
  UnauthenticatedError,
} from "../api";
import { labelFor } from "../components/profileConstants";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Section, { Divider, KeyValueList } from "../ui/Section";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Dialog from "../ui/Dialog";
import styles from "./Screen.module.css";

function optionalValue(value: string | number | null): string {
  if (value === null || value === "") return "Not provided";
  return String(value);
}

function formatLocalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProfileScreen() {
  const { profile, user, clearProfile } = useAuth();
  const navigate = useNavigate();

  const [logoutPending, setLogoutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [autoStartDelay, setAutoStartDelay] = useState<number | null>(null);
  const [prefLoading, setPrefLoading] = useState(true);
  const [prefError, setPrefError] = useState(false);

  const loadPref = useCallback(async () => {
    setPrefLoading(true);
    setPrefError(false);
    try {
      const preference = await fetchWorkoutPreferences();
      setAutoStartDelay(preference.automatic_set_start_delay_seconds);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        clearProfile();
        navigate("/login", { replace: true });
        return;
      }
      setPrefError(true);
      setAutoStartDelay(null);
    } finally {
      setPrefLoading(false);
    }
  }, [clearProfile, navigate]);

  useEffect(() => {
    void loadPref();
  }, [loadPref]);

  const handleLogout = async () => {
    setError(null);
    setLogoutPending(true);
    try {
      await apiLogout();
      clearProfile();
      navigate("/login", { replace: true });
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      setLogoutPending(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setDeletePending(true);
    try {
      const result = await deleteFitnessProfile();
      if (result !== null) {
        setError(result.detail);
      } else {
        clearProfile();
        navigate("/login", { replace: true });
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setDeletePending(false);
    }
  };

  if (!profile) return null;

  return (
    <>
      <AppHeader title="Profile" />

      <Page width="reading">
        <Section title="Body">
          <KeyValueList
            items={[
              { label: "Date of birth", value: profile.date_of_birth },
              { label: "Biological sex", value: labelFor(profile.biological_sex) },
              { label: "Height", value: `${profile.height_cm} cm` },
              {
                label: "Current body weight",
                value: `${profile.weight_kg} kg${
                  profile.current_weight_measurement_date
                    ? ` · Recorded on ${formatLocalDate(profile.current_weight_measurement_date)}`
                    : ""
                }`,
              },
              {
                label: "Body fat percentage",
                value:
                  profile.body_fat_percentage === null
                    ? "Not provided"
                    : `${profile.body_fat_percentage}%`,
              },
            ]}
          />
          <div className={styles.mt3}>
            <Button
              variant="secondary"
              size="small"
              onClick={() => navigate("/progress/body-weight")}
            >
              Record body weight
            </Button>
          </div>
        </Section>

        <Section title="Training">
          <KeyValueList
            items={[
              { label: "Experience", value: labelFor(profile.training_experience) },
              { label: "Primary goal", value: labelFor(profile.primary_goal) },
              { label: "Days per week", value: String(profile.training_days_per_week) },
              {
                label: "Workout duration",
                value: `${profile.preferred_workout_duration_minutes} min`,
              },
            ]}
          />
        </Section>

        <Section title="Preferences and constraints">
          <KeyValueList
            items={[
              { label: "Environment", value: labelFor(profile.training_environment) },
              { label: "Limitations", value: optionalValue(profile.physical_limitations) },
            ]}
          />
        </Section>

        <Section title="Workout settings">
          {prefLoading ? (
            <p className={styles.textCompactMuted}>Loading set start...</p>
          ) : prefError ? (
            <div className={styles.stack2}>
              <Alert variant="error">Unable to load workout settings.</Alert>
              <Button variant="secondary" size="small" onClick={() => void loadPref()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <KeyValueList
                items={[
                  {
                    label: "Set start",
                    value:
                      autoStartDelay === 0
                        ? "Manual"
                        : `Automatic after ${autoStartDelay ?? 0} seconds`,
                  },
                ]}
              />
              <div className={styles.mt3}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => navigate("/profile/workout-settings")}
                >
                  Manage workout settings
                </Button>
              </div>
            </>
          )}
        </Section>

        <Divider />

        <Section title="Account">
          <KeyValueList items={[{ label: "Email", value: user?.email ?? "" }]} />
          <div className={styles.accountActions}>
            {error && <Alert variant="error">{error}</Alert>}
            <Button variant="primary" onClick={() => navigate("/profile/edit")}>
              Edit profile
            </Button>
            <Button variant="secondary" onClick={handleLogout} disabled={logoutPending}>
              {logoutPending ? "Logging out..." : "Log out"}
            </Button>
          </div>
        </Section>

        <Divider />

        <Button
          variant="ghost"
          onClick={() => setShowDelete(true)}
          className={`${styles.dangerText} ${styles.fullWidth}`}
        >
          Delete profile
        </Button>
      </Page>

      <Dialog
        open={showDelete}
        title="Delete profile"
        onClose={deletePending ? () => {} : () => setShowDelete(false)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowDelete(false)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? "Deleting..." : "Delete profile"}
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete your fitness profile? This will permanently remove all
          saved profile data and sign you out. You will need to log in and complete onboarding
          again.
        </p>
        {error && <Alert variant="error">{error}</Alert>}
      </Dialog>
    </>
  );
}
