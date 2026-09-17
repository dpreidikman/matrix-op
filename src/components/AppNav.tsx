import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/lib/auth";

const LINKS = [
  { to: "/", label: "MATRIX", roles: ["administrador", "usuario"] },
  { to: "/documentos", label: "Documentos", roles: ["administrador"] },
  { to: "/carga-manual", label: "Carga manual", roles: ["administrador"] },
  { to: "/vinson", label: "Ventas", roles: ["administrador", "usuario"] },
  { to: "/gedis", label: "GEDIS", roles: ["administrador", "usuario"] },
  { to: "/proyecciones", label: "Proyecciones", roles: ["administrador"] },
  { to: "/percentages", label: "Configuraciones", roles: ["administrador"] },
  { to: "/agente", label: "Agente", roles: ["administrador", "usuario"] },
  { to: "/usuarios", label: "Usuarios", roles: ["administrador"] },
] as const;

function linkClass(active: boolean) {
  return active
    ? "text-left px-3 py-2.5 rounded-md text-sm font-medium border bg-cyan/10 border-cyan/30 text-cyan"
    : "text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground";
}

// Lista de módulos filtrada por rol + usuario actual / cerrar sesión.
// Se usa dentro del <nav> de cada página (reemplaza la lista de Links fija).
export function AppNav({ active }: { active: string }) {
  const { user, isAdmin, logout } = useAuth();
  const role: Role = isAdmin ? "administrador" : "usuario";

  return (
    <>
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 px-2">Módulos</div>
      {LINKS.filter((l) => (l.roles as readonly Role[]).includes(role)).map((l) => (
        <Link key={l.to} to={l.to} className={linkClass(l.to === active)}>
          {l.label}
        </Link>
      ))}
      {user && (
        <div className="mt-2 pt-3 border-t border-white/10 px-2">
          <div className="text-xs text-foreground truncate">{user.nombre}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{user.rol}</div>
          <button
            onClick={logout}
            className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3" /> Cerrar sesión
          </button>
        </div>
      )}
    </>
  );
}
