import { useEffect, useState } from "react";
import { currentUser, logout as doLogout, type AppUser } from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(currentUser());
    setReady(true);
  }, []);

  const logout = () => {
    doLogout();
    setUser(null);
  };

  return { user, ready, isAdmin: user?.rol === "administrador", logout };
}
