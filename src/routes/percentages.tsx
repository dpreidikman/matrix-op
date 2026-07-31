import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Menu, X, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  DEFAULT_PCT,
  PCT_LOCALS,
  PCT_MONTHS_2026,
  loadPctConfig,
  savePctConfig,
  type PctConfig,
} from "@/lib/pctConfig";

export const Route = createFileRoute("/percentages")({
  head: () => ({
    meta: [
      { title: "MATRIX // Configuraciones" },
      { name: "description", content: "Editar porcentajes de Venta F y NF por local y por mes." },
      { property: "og:title", content: "MATRIX // % Venta F/NF" },
      { property: "og:description", content: "Configuración de porcentajes por local y mes." },
    ],
  }),
  component: Percentages,
});

const MES_LABELS = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MES_LABELS[m - 1]} ${y}`;
};

function Percentages() {
  const [cfg, setCfg] = useState<PctConfig>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setCfg(loadPctConfig());
  }, []);

  const setValue = (local: string, ym: string, field: "f" | "nf", value: number) => {
    setCfg((s) => {
      const localCfg = { ...(s[local] ?? {}) };
      const cur = localCfg[ym] ?? { ...DEFAULT_PCT };
      localCfg[ym] = { ...cur, [field]: value };
      const next = { ...s, [local]: localCfg };
      savePctConfig(next);
      return next;
    });
  };

  const resetAll = () => {
    if (!confirm("¿Restablecer todos los % a los valores por defecto (F 62.92% / NF 48%)?")) return;
    setCfg({});
    savePctConfig({});
    toast.success("Configuración restablecida");
  };

  const applyToAllMonths = (local: string, field: "f" | "nf", value: number) => {
    setCfg((s) => {
      const localCfg = { ...(s[local] ?? {}) };
      for (const ym of PCT_MONTHS_2026) {
        const cur = localCfg[ym] ?? { ...DEFAULT_PCT };
        localCfg[ym] = { ...cur, [field]: value };
      }
      const next = { ...s, [local]: localCfg };
      savePctConfig(next);
      return next;
    });
    toast.success(`${field.toUpperCase()} aplicado a todo 2026`);
  };

  const totals = useMemo(() => {
    const rows: { local: string; ym: string; f: number; nf: number; sum: number }[] = [];
    for (const local of PCT_LOCALS) {
      for (const ym of PCT_MONTHS_2026) {
        const e = cfg[local]?.[ym] ?? DEFAULT_PCT;
        rows.push({ local, ym, f: e.f, nf: e.nf, sum: e.f + e.nf });
      }
    }
    return rows;
  }, [cfg]);

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-hidden">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-30" />
            
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
              <div className="mt-1 text-xl font-bold tracking-tight">Configuraciones</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>

          <nav className="flex flex-col gap-1 overflow-y-auto pr-1 -mr-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 px-2">Módulos</div>
            <Link to="/" className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground">
              MATRIX
            </Link>
            <Link to="/documentos" className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground">
              Documentos
            </Link>
            <Link to="/vinson" className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground">
              Ventas
            </Link>
            <Link to="/percentages" className="text-left px-3 py-2.5 rounded-md text-sm font-medium border bg-cyan/10 border-cyan/30 text-cyan">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan animate-pulse" />
                <span>Configuraciones</span>
              </div>
            </Link>
            <Link to="/agente" className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground">
              Agente
            </Link>
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
                <Menu className="size-5" />
              </button>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Configuración</div>
                <h1 className="text-2xl font-bold tracking-tight">Porcentajes por local y mes</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Se aplica sobre TOTAL VENTA BRUTA (Vinson) para calcular Venta F y Venta NF.
                  Guardado automático en este navegador. Default: F {DEFAULT_PCT.f.toFixed(2)}% · NF {DEFAULT_PCT.nf}%.
                </p>
              </div>
            </div>
            <button
              onClick={resetAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-white/10 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-white/30"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          </div>

          {PCT_LOCALS.map((local) => (
            <section key={local} className="rounded-xl border border-white/10 bg-background/50 backdrop-blur-sm overflow-hidden">
              <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-cyan animate-pulse" />
                  <h2 className="font-mono uppercase tracking-wider text-sm">{local}</h2>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <Save className="size-3" /> autosave
                </div>
              </header>
              <div className="overflow-x-auto scrollbar-cyan">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-white/10">
                      <th className="text-left px-4 py-3 sticky left-0 bg-background/80 backdrop-blur">Mes</th>
                      <th className="text-right px-4 py-3">Venta F %</th>
                      <th className="text-right px-4 py-3">Venta NF %</th>
                      <th className="text-right px-4 py-3">Suma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PCT_MONTHS_2026.map((ym) => {
                      const entry = cfg[local]?.[ym] ?? DEFAULT_PCT;
                      const sum = entry.f + entry.nf;
                      const row = totals.find((t) => t.local === local && t.ym === ym)!;
                      return (
                        <tr key={ym} className="border-b border-white/5 hover:bg-white/[0.02]">
                          <td className="px-4 py-2 font-mono text-xs sticky left-0 bg-background/60 backdrop-blur">
                            {monthLabel(ym)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={entry.f}
                                onChange={(e) => setValue(local, ym, "f", Number(e.target.value))}
                                className="w-24 bg-background/70 border border-white/10 rounded px-2 py-1 text-right font-mono text-xs focus:outline-none focus:border-cyan"
                              />
                              <button
                                onClick={() => applyToAllMonths(local, "f", row.f)}
                                title="Aplicar a todo 2026"
                                className="text-[9px] font-mono text-muted-foreground hover:text-cyan uppercase"
                              >
                                all
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                step="0.01"
                                value={entry.nf}
                                onChange={(e) => setValue(local, ym, "nf", Number(e.target.value))}
                                className="w-24 bg-background/70 border border-white/10 rounded px-2 py-1 text-right font-mono text-xs focus:outline-none focus:border-cyan"
                              />
                              <button
                                onClick={() => applyToAllMonths(local, "nf", row.nf)}
                                title="Aplicar a todo 2026"
                                className="text-[9px] font-mono text-muted-foreground hover:text-cyan uppercase"
                              >
                                all
                              </button>
                            </div>
                          </td>
                          <td className={`px-4 py-2 text-right font-mono text-xs ${sum > 120 ? "text-magenta" : "text-muted-foreground"}`}>
                            {sum.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </main>
      </div>
      <Toaster />
    </div>
  );
}