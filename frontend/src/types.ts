type AuthScreen = "loading" | "unavailable" | "registration" | "login" | "authenticated";

interface User {
  id: number;
  email: string;
}

export { type AuthScreen, type User };
