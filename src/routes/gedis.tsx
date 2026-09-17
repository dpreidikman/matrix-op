import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X, RefreshCw, Database } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AppNav } from "@/components/AppNav";
import { getGedisResumenXTurno } from "@/lib/gedis.functions";

export const Route = createFileRoute("/gedis")({
  head: () => ({
    meta: [
      { title: "MATRIX // GEDIS" },
      { name: "description", content: "Datos de ResumenXTurno (GEDIS / CentralCosta)." },
    ],
  }),
  component: Gedis,
});

function fmtCell(v: string | number | boolean | null) {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

function Gedis() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fetchResumen = useServerFn(getGedisResumenXTurno);

  const query = useQuery({
    queryKey: ["gedis", "resumen-x-turno"],
    queryFn: () => fetchResumen(),
    retry: false,
  });

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
              <div className="mt-1 text-xl font-bold tracking-tight">GEDIS</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <AppNav active="/gedis" />
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
                <Menu className="size-5" />
              </button>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">GEDIS · CentralCosta</div>
                <h1 className="text-2xl font-bold tracking-tight">ResumenXTurno</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Lectura directa de la base GEDIS (gedis.ar). Muestra los últimos registros de la tabla.
                </p>
              </div>
            </div>
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-2 rounded-md border border-cyan/40 bg-cyan/5 px-3 py-2 font-mono text-xs text-cyan hover:bg-cyan/15 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} /> Refrescar
            </button>
          </div>

          <section className="rounded-xl border border-white/10 bg-panel/40 overflow-hidden">
            <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-cyan" />
                <h2 className="font-mono uppercase tracking-wider text-sm">ResumenXTurno</h2>
              </div>
              {query.data && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  mostrando {query.data.rows.length} de {query.data.total} filas
                </span>
              )}
            </header>

            {query.isPending ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Consultando GEDIS…</p>
            ) : query.isError ? (
              <div className="px-5 py-6 text-sm">
                <p className="text-red-500 font-medium">No se pudo conectar a GEDIS.</p>
                <p className="mt-2 text-muted-foreground font-mono text-xs whitespace-pre-wrap">
                  {(query.error as Error)?.message ?? String(query.error)}
                </p>
                <p className="mt-3 text-muted-foreground">
                  Si el error menciona variables de entorno, hay que cargar GEDIS_DB_USER y GEDIS_DB_PASSWORD en
                  Lovable Cloud. Si es un error de conexión/timeout, puede ser que el entorno de despliegue no
                  soporte conexiones TCP directas a SQL Server.
                </p>
              </div>
            ) : query.data && query.data.rows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">La tabla no tiene registros.</p>
            ) : query.data ? (
              <div className="overflow-auto max-h-[70vh] scrollbar-cyan">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-white/10">
                      {query.data.columns.map((c) => (
                        <th key={c} className="text-left px-4 py-3 sticky top-0 bg-background/90 backdrop-blur whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.rows.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                        {query.data!.columns.map((c) => (
                          <td key={c} className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                            {fmtCell(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
