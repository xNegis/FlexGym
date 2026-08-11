import { type FormEvent, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { loginUser } from "../api";
import { useAuth } from "../context";
import Button from "../ui/Button";
import { Field, TextInput } from "../ui/Field";
import Alert from "../ui/Alert";
import styles from "./Screen.module.css";

export default function LoginScreen() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/plan";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !pending;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const result = await loginUser(email, password);
      if ("detail" in result) {
        setError(result.detail);
      } else {
        await setUser(result);
        navigate(from, { replace: true });
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
        <h2 className={styles.screenTitle}>Log in to FlexGym</h2>
        <p className={styles.textBodyMuted}>Enter your credentials to continue</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Field htmlFor="login-email" label="Email">
        <TextInput
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
          placeholder="your@email.com"
        />
      </Field>

      <Field htmlFor="login-password" label="Password">
        <TextInput
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={pending}
        />
      </Field>

      <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
        {pending ? "Logging in..." : "Log in"}
      </Button>

      <p className={styles.authSwitch}>
        No account yet?{" "}
        <Link to="/register" className={styles.authLink}>
          Register
        </Link>
      </p>
    </form>
  );
}
