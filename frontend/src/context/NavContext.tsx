import { createContext, useContext, useState, type ReactNode } from "react";

export type WorkoutNavStatus = "in_progress" | "terminal" | null;

interface WorkoutNavContextValue {
  workoutNavStatus: WorkoutNavStatus;
  setWorkoutNavStatus: (status: WorkoutNavStatus) => void;
}

const WorkoutNavContext = createContext<WorkoutNavContextValue | null>(null);

export function WorkoutNavProvider({ children }: { children: ReactNode }) {
  const [workoutNavStatus, setWorkoutNavStatus] = useState<WorkoutNavStatus>(null);

  return (
    <WorkoutNavContext.Provider value={{ workoutNavStatus, setWorkoutNavStatus }}>
      {children}
    </WorkoutNavContext.Provider>
  );
}

export function useWorkoutNav(): WorkoutNavContextValue {
  const ctx = useContext(WorkoutNavContext);
  if (!ctx) throw new Error("useWorkoutNav must be used within WorkoutNavProvider");
  return ctx;
}
