import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context";
import { deleteFitnessProfile, logout as apiLogout } from "../api";
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

export default function ProfileScreen() {
  const { profile, user, clearProfile } = useAuth();
  const navigate = useNavigate();

  const [logoutPending, setLogoutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

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
              { label: "Body weight", value: `${profile.weight_kg} kg` },
              {
                label: "Body fat percentage",
                value:
                  profile.body_fat_percentage === null
                    ? "Not provided"
                    : `${profile.body_fat_percentage}%`,
              },
            ]}
          />
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
