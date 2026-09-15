import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppNav } from "@/components/AppNav";
import { RequireAdmin } from "@/components/RequireAdmin";
import { useAuth } from "@/hooks/use-auth";
import { loadUsers, addOrUpdateUser, removeUser, type AppUser, type Role } from "@/lib/auth";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "MATRIX // Usuarios" },
      { name: "description", content: "Administración de usuarios y permisos." },
    ],
  }),
  component: Usuarios,
});

function Usuarios() {
  return (
    <RequireAdmin>
      <UsuariosContent />
    </RequireAdmin>
  );
}

function UsuariosContent() {
  const { user: me } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Role>("usuario");

  useEffect(() => {
    setUsers(loadUsers());
  }, []);

  const submit = async () => {
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      toast.error("Completá nombre, email y contraseña.");
      return;
    }
    const next = await addOrUpdateUser({ nombre: nombre.trim(), email: email.trim(), password, rol });
    setUsers(next);
    setNombre("");
    setEmail("");
    setPassword("");
    setRol("usuario");
    toast.success("Usuario guardado");
  };

  const remove = (u: AppUser) => {
    if (u.id === me?.id) {
      toast.error("No podés eliminar tu propio usuario mientras estás conectado.");
      return;
    }
    const quedanAdmins = users.some((x) => x.id !== u.id && x.rol === "administrador");
    if (u.rol === "administrador" && !quedanAdmins) {
      toast.error("Tiene que quedar al menos un administrador.");
      return;
    }
    setUsers(removeUser(u.id));
    toast.success("Usuario eliminado");
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans">
      <div className="relative flex min-h-screen">
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <aside
          className={`fixed left-0 top-0 z-40 h-full w-64 border-r border-white/10 bg-background/70 backdrop-blur-xl p-5 flex flex-col gap-8 transition-transform duration-300 lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:static lg:h-auto`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Modulo</div>
              <div className="mt-1 text-xl font-bold tracking-tight">Usuarios</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <AppNav active="/usuarios" />
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="size-5" />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Permisos</div>
              <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Administrador: puede cargar y modificar datos, proyecciones y comentarios. Usuario: solo puede
                acceder a Matrix, Ventas y Agente, sin modificar datos.
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-white/10 bg-panel/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserRound className="size-4 text-cyan" />
              <h2 className="font-mono uppercase tracking-wider text-sm">Nuevo usuario / actualizar existente</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Nombre</span>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Correo</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Contraseña</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Si ya existe, la actualiza"
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Rol</span>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as Role)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                >
                  <option value="administrador">Administrador</option>
                  <option value="usuario">Usuario</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  onClick={submit}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-2 font-mono text-xs text-cyan hover:bg-cyan/20"
                >
                  <Plus className="size-3.5" /> Guardar
                </button>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-mono text-muted-foreground">
              Si el correo ya existe, se actualiza ese usuario (nombre, rol y contraseña si cargaste una nueva).
            </p>
          </section>

          <section className="rounded-xl border border-white/10 bg-panel/40 overflow-hidden">
            <header className="px-5 py-3 border-b border-white/10">
              <h2 className="font-mono uppercase tracking-wider text-sm">Usuarios cargados</h2>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-white/10">
                  <th className="text-left px-4 py-3">Nombre</th>
                  <th className="text-left px-4 py-3">Correo</th>
                  <th className="text-left px-4 py-3">Rol</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-sm">{u.nombre}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2 text-xs font-mono uppercase">{u.rol}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => remove(u)} className="text-muted-foreground hover:text-foreground" title="Eliminar">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
