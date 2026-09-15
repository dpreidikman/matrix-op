import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

// Envuelve el contenido de una página restringida a administradores
// (Documentos, Carga manual, Proyecciones, Configuraciones, Usuarios).
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, ready } = useAuth();

  if (!ready) return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-foreground">Sin permisos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta sección es solo para usuarios con rol administrador.
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-cyan hover:underline">
            Volver a MATRIX
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
