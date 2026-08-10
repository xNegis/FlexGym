import { useState } from "react";
import { logout } from "../api";

interface Props {
  email: string;
  onLoggedOut: () => void;
}

export default function AuthShell({ email, onLoggedOut }: Props) {
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    try {
      await logout();
    } catch {
      // Logout always navigates to login even on network error
    }
    setPending(false);
    onLoggedOut();
  };

  return (
    <div className="auth-shell">
      <p className="auth-shell-email">{email}</p>
      <button
        type="button"
        className="auth-logout"
        onClick={handleLogout}
        disabled={pending}
      >
        {pending ? "Logging out..." : "Log out"}
      </button>
    </div>
  );
}