import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Menu, X, Plus, Trash2, Target, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppNav } from "@/components/AppNav";
import { RequireAdmin } from "@/components/RequireAdmin";
import {
  mergeMatrixData,
  filterMatrixByPeriod,
  rebuildPylFromGastos,
  listaConceptosProyectables,
  type MatrixData,
} from "@/lib/matrixParser";
import { loadManualEntries, manualEntriesToGastos } from "@/lib/manualEntries";
import {
  PROYECCION_LOCALS,
  esConceptoIngreso,
  loadProyecciones,
  upsertProyeccion,
  removeProyeccion,
  monthRange,
  type Proyeccion,
} from "@/lib/projections";

export const Route = createFileRoute("/proyecciones")({
  head: () => ({
    meta: [
      { title: "MATRIX // Proyecciones" },
      { name: "description", content: "Estimación de ventas y gastos por local, categoría y mes, con alertas vs. real." },
    ],
  }),
  component: Proyecciones,
});

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const fmtPct = (n: number) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "—");

const KEYS = { A: "matrix:v1:auto", B: "matrix:v1:detallado" } as const;

// Misma composición que usa el dashboard principal: archivo(s) cargado(s) + carga manual.
function loadCombinedData(): MatrixData | null {
  try {
    const rawA = localStorage.getItem(KEYS.A);
    const rawB = localStorage.getItem(KEYS.B);
    const a = rawA ? (JSON.parse(rawA) as MatrixData) : null;
    const b = rawB ? (JSON.parse(rawB) as MatrixData) : null;
    let base = a && b ? mergeMatrixData(a, b) : (b ?? a);
    if (!base) return null;
    const manual = loadManualEntries();
    if (manual.length) {
      const gastos = [...(base.gastos ?? []), ...manualEntriesToGastos(manual)];
      base = rebuildPylFromGastos({ ...base, gastos: base.gastos ?? [] }, gastos);
    }
    return base;
  } catch (e) {
    console.warn("proyecciones: no se pudo leer la Matrix cargada", e);
    return null;
  }
}

function Proyecciones() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [proyecciones, setProyecciones] = useState<Proyeccion[]>([]);
  const [combined, setCombined] = useState<MatrixData | null>(null);
  const [threshold, setThreshold] = useState(10);

  const [local, setLocal] = useState<string>(PROYECCION_LOCALS[0]);
  const conceptos = useMemo(() => listaConceptosProyectables(), []);
  const [concepto, setConcepto] = useState<string>(conceptos[0]?.concepto ?? "");
  const [mes, setMes] = useState<string>(new Date().toISOString().slice(0, 7));
  const [monto, setMonto] = useState<string>("");

  useEffect(() => {
    setProyecciones(loadProyecciones());
    setCombined(loadCombinedData());
  }, []);

  const conceptosPorGrupo = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of conceptos) {
      if (!m.has(c.parent)) m.set(c.parent, []);
      m.get(c.parent)!.push(c.concepto);
    }
    return [...m.entries()];
  }, [conceptos]);

  const submit = () => {
    const montoNum = Number(monto);
    if (!local || !concepto || !mes || !montoNum) {
      toast.error("Completá local, categoría, mes y un monto válido.");
      return;
    }
    const next = upsertProyeccion({ local, concepto, mes, monto: montoNum });
    setProyecciones(next);
    setMonto("");
    toast.success("Proyección guardada");
  };

  const remove = (id: string) => {
    setProyecciones(removeProyeccion(id));
  };

  // Real vs proyectado por cada fila cargada
  const comparacion = useMemo(() => {
    if (!combined) return [];
    return proyecciones
      .map((p) => {
        const [from, to] = monthRange(p.mes);
        const filtered = combined.gastos?.length ? filterMatrixByPeriod(combined, from, to) : combined;
        const row = filtered.pyl.find((r) => r.concepto === p.concepto);
        const real = row?.porLocal[p.local] ?? 0;
        const variacion = real - p.monto;
        const variacionPct = p.monto ? variacion / Math.abs(p.monto) : real ? Infinity : 0;
        const esIngreso = esConceptoIngreso(p.concepto);
        // Alerta: para gastos, cuando el real se pasa de lo proyectado; para
        // ingresos, cuando el real queda por debajo de lo proyectado.
        const desvioMalo = esIngreso ? -variacionPct : variacionPct;
        const alerta = desvioMalo * 100 > threshold;
        return { ...p, real, variacion, variacionPct, esIngreso, alerta };
      })
      .sort((a, b) => (b.alerta ? 1 : 0) - (a.alerta ? 1 : 0) || Math.abs(b.variacion) - Math.abs(a.variacion));
  }, [combined, proyecciones, threshold]);

  const alertas = comparacion.filter((c) => c.alerta);

  return (
    <RequireAdmin>
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
              <div className="mt-1 text-xl font-bold tracking-tight">Proyecciones</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <AppNav active="/proyecciones" />
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="size-5" />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Proyecciones</div>
              <h1 className="text-2xl font-bold tracking-tight">Estimación vs. real</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Cargá una estimación de venta o gasto por local, categoría y mes. El sistema la compara contra
                lo real de la Matrix cargada (archivos + carga manual) y avisa cuando el desvío supera el umbral.
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-white/10 bg-panel/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Target className="size-4 text-cyan" />
              <h2 className="font-mono uppercase tracking-wider text-sm">Nueva proyección</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Local</span>
                <select
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                >
                  {PROYECCION_LOCALS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Categoría</span>
                <select
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                >
                  {conceptosPorGrupo.map(([parent, items]) => (
                    <optgroup key={parent} label={parent}>
                      {items.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Mes</span>
                <input
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Monto estimado</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm font-mono focus:outline-none focus:border-cyan"
                />
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
              Si ya existe una proyección para ese local + categoría + mes, se actualiza el monto.
            </p>
          </section>

          {alertas.length > 0 && (
            <section className="rounded-xl border border-red-500/40 bg-red-500/5 overflow-hidden">
              <header className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-500" />
                <h2 className="font-mono uppercase tracking-wider text-sm text-red-500">
                  {alertas.length} alerta(s): desvío mayor a {threshold}%
                </h2>
              </header>
              <div className="p-5 space-y-2">
                {alertas.map((a) => (
                  <div key={a.id} className="text-sm">
                    <span className="font-medium">{a.local} · {a.concepto} · {a.mes}</span>{" "}
                    <span className="text-muted-foreground">
                      — proyectado {fmtMoney(a.monto)}, real {fmtMoney(a.real)} ({a.variacion >= 0 ? "+" : ""}
                      {fmtMoney(a.variacion)}, {fmtPct(a.variacionPct)})
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-panel/40 overflow-hidden">
            <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-4">
              <h2 className="font-mono uppercase tracking-wider text-sm">Proyectado vs. real</h2>
              <label className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                Umbral de alerta
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                  className="w-16 bg-background/70 border border-white/10 rounded px-2 py-1 text-right"
                />
                %
              </label>
            </header>
            {!combined ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Todavía no hay ninguna planilla ni carga manual — subí un documento o cargá datos manuales para
                ver el real.
              </p>
            ) : comparacion.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Todavía no cargaste ninguna proyección.</p>
            ) : (
              <div className="overflow-x-auto scrollbar-cyan">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-white/10">
                      <th className="text-left px-4 py-3">Mes</th>
                      <th className="text-left px-4 py-3">Local</th>
                      <th className="text-left px-4 py-3">Categoría</th>
                      <th className="text-right px-4 py-3">Proyectado</th>
                      <th className="text-right px-4 py-3">Real</th>
                      <th className="text-right px-4 py-3">Variación</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparacion.map((c) => (
                      <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-2 font-mono text-xs">{c.mes}</td>
                        <td className="px-4 py-2 text-xs">{c.local}</td>
                        <td className="px-4 py-2 text-xs">{c.concepto}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">{fmtMoney(c.monto)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">{fmtMoney(c.real)}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs ${c.alerta ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                          {c.variacion >= 0 ? "+" : ""}{fmtMoney(c.variacion)} ({fmtPct(c.variacionPct)})
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-foreground" title="Eliminar">
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
      <Toaster />
    </div>
    </RequireAdmin>
  );
}
