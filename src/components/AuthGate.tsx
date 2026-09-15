import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { login, currentUser, type AppUser } from "@/lib/auth";

// Gatea TODA la app detrás de un login simple (ver comentario en
// src/lib/auth.ts: es un gate de UI, no seguridad real).
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUser(currentUser());
  }, []);

  // undefined = todavía no chequeamos sessionStorage (evita parpadeo/mismatch de hidratación)
  if (user === undefined) {
    return <div className="min-h-screen bg-background" />;
  }

  if (user) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const u = await login(email, password);
      if (!u) {
        setError("Email o contraseña incorrectos.");
        return;
      }
      setUser(u);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-white/10 bg-panel/40 p-6 space-y-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Matrix</div>
          <h1 className="text-xl font-bold tracking-tight">Iniciar sesión</h1>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-mono uppercase tracking-wider">Email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background/70 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground font-mono uppercase tracking-wider">Contraseña</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-background/70 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md border border-cyan/40 bg-cyan/10 px-3 py-2 font-mono text-xs text-cyan hover:bg-cyan/20 disabled:opacity-50"
        >
          {loading ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
