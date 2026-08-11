import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../api";
import { useAuth } from "../context";
import Button from "../ui/Button";
import { Field, TextInput } from "../ui/Field";
import Alert from "../ui/Alert";
import styles from "./Screen.module.css";

export default function RegisterScreen() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const passwordMatchError =
    passwordConfirmation.length > 0 && password !== passwordConfirmation
      ? "Passwords do not match"
      : null;

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    passwordConfirmation.length > 0 &&
    password === passwordConfirmation &&
    !pending;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const result = await registerUser(email, password);
      if ("detail" in result) {
        setError(result.detail);
      } else {
        await setUser(result);
        navigate("/onboarding", { replace: true });
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.stack5}>
      <div>
        <h2 className={styles.screenTitle}>Create your account</h2>
        <p className={styles.textBodyMuted}>Set up your FlexGym account to get started</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Field htmlFor="reg-email" label="Email">
        <TextInput
          id="reg-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
          placeholder="your@email.com"
        />
      </Field>

      <Field htmlFor="reg-password" label="Password" hint="At least 15 characters">
        <TextInput
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={15}
          maxLength={128}
          disabled={pending}
        />
      </Field>

      <Field
        htmlFor="reg-password-confirm"
        label="Confirm password"
        error={passwordMatchError ?? undefined}
      >
        <TextInput
          id="reg-password-confirm"
          type="password"
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          required
          minLength={15}
          maxLength={128}
          disabled={pending}
          error={passwordMatchError ?? undefined}
        />
      </Field>

      <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
        {pending ? "Creating account..." : "Register"}
      </Button>

      <p className={styles.authSwitch}>
        Already have an account?{" "}
        <Link to="/login" className={styles.authLink}>
          Log in
        </Link>
      </p>
    </form>
  );
}
