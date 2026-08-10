import { type FormEvent, useState } from "react";
import { loginUser } from "../api";
import type { AuthErrorResponse, UserResponse } from "../api";

interface Props {
  onLoggedIn: (user: UserResponse) => void;
}

export default function LoginForm({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !pending;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const result = await loginUser(email, password);
      if ("detail" in result) {
        setError((result as AuthErrorResponse).detail);
      } else {
        onLoggedIn(result as UserResponse);
      }
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2 className="auth-title">Log in to FlexGym</h2>
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={pending}
        />
      </label>
      <button type="submit" className="auth-button" disabled={!canSubmit}>
        {pending ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}