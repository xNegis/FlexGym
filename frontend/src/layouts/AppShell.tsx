import { type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CalendarCheck, ChevronLeft, Dumbbell, History, LayoutList, User } from "lucide-react";
import IconButton from "../ui/IconButton";
import { useWorkoutNav, WorkoutNavProvider } from "../context";
import styles from "./AppShell.module.css";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Today", path: "/today", icon: <CalendarCheck className={styles.navIcon} /> },
  { label: "History", path: "/history", icon: <History className={styles.navIcon} /> },
  { label: "Plan", path: "/plan", icon: <LayoutList className={styles.navIcon} /> },
  { label: "Exercises", path: "/exercises", icon: <Dumbbell className={styles.navIcon} /> },
  { label: "Profile", path: "/profile", icon: <User className={styles.navIcon} /> },
];

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function AppHeader({ title, showBack = false, onBack }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      {showBack && (
        <IconButton
          label="Go back"
          className={styles.headerBack}
          onClick={onBack ?? (() => navigate(-1))}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </IconButton>
      )}
      <h1 className={styles.headerTitle}>{title}</h1>
    </header>
  );
}

export default function AppShell() {
  return (
    <WorkoutNavProvider>
      <AppShellContent />
    </WorkoutNavProvider>
  );
}

function AppShellContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workoutNavStatus } = useWorkoutNav();

  const isWorkoutRoute = location.pathname.startsWith("/workouts");

  const isActive = (path: string) => {
    if (path === "/today") {
      return (
        location.pathname === "/today" || (isWorkoutRoute && workoutNavStatus === "in_progress")
      );
    }
    if (path === "/history") {
      return (
        location.pathname === "/history" || (isWorkoutRoute && workoutNavStatus === "terminal")
      );
    }
    if (path === "/plan") return location.pathname.startsWith("/plan");
    if (path === "/exercises") return location.pathname.startsWith("/exercises");
    if (path === "/profile") return location.pathname.startsWith("/profile");
    return location.pathname === path;
  };

  return (
    <div className={styles.appShell}>
      <nav className={styles.bottomNav} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            type="button"
            className={`${styles.navItem} ${isActive(item.path) ? styles.navItemActive : ""}`}
            onClick={() => navigate(item.path)}
            aria-current={isActive(item.path) ? "page" : undefined}
          >
            {item.icon}
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
