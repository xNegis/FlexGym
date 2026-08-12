import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context";
import { RequireProfile, RedirectIfAuthenticated, RedirectToOnboarding } from "./guards";
import AppShell from "../layouts/AppShell";
import AuthLayout from "../layouts/AuthLayout";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import UnavailableScreen from "../screens/UnavailableScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ProfileEditScreen from "../screens/ProfileEditScreen";
import ExerciseCatalogScreen from "../screens/ExerciseCatalogScreen";
import ExerciseDetailScreen from "../screens/ExerciseDetailScreen";
import RoutineCreateScreen from "../screens/RoutineCreateScreen";
import RoutineDetailScreen from "../screens/RoutineDetailScreen";
import RoutineEditScreen from "../screens/RoutineEditScreen";
import TrainingDayExercisesScreen from "../screens/TrainingDayExercisesScreen";
import PlanRedirect from "../screens/PlanRedirect";
import TodayScreen from "../screens/TodayScreen";
import WorkoutScreen from "../screens/WorkoutScreen";
import WorkoutExecutionScreen from "../screens/WorkoutExecutionScreen";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <AuthLayout />
              </RedirectIfAuthenticated>
            }
          >
            <Route index element={<LoginScreen />} />
          </Route>

          <Route
            path="/register"
            element={
              <RedirectIfAuthenticated>
                <AuthLayout />
              </RedirectIfAuthenticated>
            }
          >
            <Route index element={<RegisterScreen />} />
          </Route>

          <Route path="/unavailable" element={<AuthLayout />}>
            <Route index element={<UnavailableScreen />} />
          </Route>

          <Route
            path="/onboarding"
            element={
              <RedirectToOnboarding>
                <AuthLayout />
              </RedirectToOnboarding>
            }
          >
            <Route index element={<OnboardingScreen />} />
          </Route>

          <Route
            element={
              <RequireProfile>
                <AppShell />
              </RequireProfile>
            }
          >
            <Route path="/today" element={<TodayScreen />} />
            <Route path="/workouts/:workoutId" element={<WorkoutScreen />} />
            <Route
              path="/workouts/:workoutId/exercises/:exercisePosition"
              element={<WorkoutExecutionScreen />}
            />
            <Route path="/plan" element={<PlanRedirect />} />
            <Route path="/plan/routines/new" element={<RoutineCreateScreen />} />
            <Route path="/plan/routines/:routineId" element={<RoutineDetailScreen />} />
            <Route path="/plan/routines/:routineId/edit" element={<RoutineEditScreen />} />
            <Route
              path="/plan/routines/:routineId/days/:trainingDayId/exercises"
              element={<TrainingDayExercisesScreen />}
            />
            <Route path="/exercises" element={<ExerciseCatalogScreen />} />
            <Route path="/exercises/:slug" element={<ExerciseDetailScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="/profile/edit" element={<ProfileEditScreen />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
