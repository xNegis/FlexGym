import { useState } from "react";
import { logout } from "../api";

interface Props {
  email: string;
  onLoggedOut: () => void;
}

export default function AuthShell({ email, onLoggedOut }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="auth-shell">
      <p className="auth-shell-email">{email}</p>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="auth-logout" onClick={handleLogout} disabled={pending}>
        {pending ? "Logging out..." : "Log out"}
      </button>
    </div>
  );
}
