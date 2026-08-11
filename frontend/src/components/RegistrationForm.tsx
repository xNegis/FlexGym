import { type FormEvent, useState } from "react";
import { registerUser } from "../api";
import type { UserResponse } from "../api";

interface Props {
  onRegistered: (user: UserResponse) => void;
  onLoginRequested: () => void;
}

export default function RegistrationForm({ onRegistered, onLoginRequested }: Props) {
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
        onRegistered(result);
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2 className="auth-title">Create your account</h2>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
        />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={15}
          maxLength={128}
          disabled={pending}
        />
      </label>
      <label className="auth-field">
        <span>Confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          required
          minLength={15}
          maxLength={128}
          disabled={pending}
        />
        {passwordMatchError && <span className="auth-field-error">{passwordMatchError}</span>}
      </label>
      <button type="submit" className="auth-button" disabled={!canSubmit}>
        {pending ? "Creating account..." : "Register"}
      </button>
      <p className="auth-switch">
        Already have an account?{" "}
        <button type="button" onClick={onLoginRequested} disabled={pending}>
          Log in
        </button>
      </p>
    </form>
  );
}
