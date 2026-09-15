import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Menu, X, Plus, Trash2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AppNav } from "@/components/AppNav";
import { RequireAdmin } from "@/components/RequireAdmin";
import {
  MANUAL_CONCEPTOS,
  MANUAL_LOCALS,
  GRANULARIDAD_LABEL,
  loadManualEntries,
  addManualEntry,
  removeManualEntry,
  type Granularidad,
  type ManualEntry,
} from "@/lib/manualEntries";

export const Route = createFileRoute("/carga-manual")({
  head: () => ({
    meta: [
      { title: "MATRIX // Carga manual" },
      { name: "description", content: "Ingreso manual de categorías sin desglose por archivo." },
    ],
  }),
  component: CargaManual,
});

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

// yyyy-Www (input type=week) → ISO del lunes de esa semana
function isoWeekToMonday(weekValue: string): string {
  const [yearStr, weekStr] = weekValue.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayISO().slice(0, 7);
const thisYear = () => String(new Date().getFullYear());

function CargaManual() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entries, setEntries] = useState<ManualEntry[]>([]);

  const [local, setLocal] = useState<string>(MANUAL_LOCALS[0]);
  const [concepto, setConcepto] = useState<string>(MANUAL_CONCEPTOS[0].concepto);
  const [granularidad, setGranularidad] = useState<Granularidad>("mes");
  const [periodoDia, setPeriodoDia] = useState(todayISO());
  const [periodoSemana, setPeriodoSemana] = useState("");
  const [periodoMes, setPeriodoMes] = useState(thisMonth());
  const [periodoAnio, setPeriodoAnio] = useState(thisYear());
  const [monto, setMonto] = useState<string>("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    setEntries(loadManualEntries());
  }, []);

  const fechaAncla = useMemo(() => {
    switch (granularidad) {
      case "dia":
        return periodoDia;
      case "semana":
        return periodoSemana ? isoWeekToMonday(periodoSemana) : "";
      case "mes":
        return periodoMes ? `${periodoMes}-01` : "";
      case "anio":
        return periodoAnio ? `${periodoAnio}-01-01` : "";
    }
  }, [granularidad, periodoDia, periodoSemana, periodoMes, periodoAnio]);

  const submit = () => {
    const montoNum = Number(monto);
    if (!local || !concepto || !fechaAncla || !montoNum) {
      toast.error("Completá local, categoría, período y un monto válido.");
      return;
    }
    const next = addManualEntry({ local, concepto, monto: montoNum, fecha: fechaAncla, granularidad, nota: nota || undefined });
    setEntries(next);
    setMonto("");
    setNota("");
    toast.success("Dato cargado a la Matrix");
  };

  const remove = (id: string) => {
    setEntries(removeManualEntry(id));
    toast.success("Registro eliminado");
  };

  const totalPorConcepto = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.concepto, (m.get(e.concepto) ?? 0) + e.monto);
    return m;
  }, [entries]);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn)),
    [entries],
  );

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
              <div className="mt-1 text-xl font-bold tracking-tight">Carga manual</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <AppNav active="/carga-manual" />
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="size-5" />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Carga</div>
              <h1 className="text-2xl font-bold tracking-tight">Carga manual de datos</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Para categorías sin desglose en ningún archivo: Otros Ingresos, CMV, Costo Laboral, Honorarios,
                Regalías, Comisiones TC y Gastos Bancarios, Impuestos, Total Alquiler y Expensas, Total Servicios
                y Estructura NG. El monto se imputa al primer día del período elegido.
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-white/10 bg-panel/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <PencilLine className="size-4 text-cyan" />
              <h2 className="font-mono uppercase tracking-wider text-sm">Nuevo registro</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Local</span>
                <select
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                >
                  {MANUAL_LOCALS.map((l) => (
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
                  {MANUAL_CONCEPTOS.map((c) => (
                    <option key={c.concepto} value={c.concepto}>{c.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Granularidad</span>
                <select
                  value={granularidad}
                  onChange={(e) => setGranularidad(e.target.value as Granularidad)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                >
                  {(Object.keys(GRANULARIDAD_LABEL) as Granularidad[]).map((g) => (
                    <option key={g} value={g}>{GRANULARIDAD_LABEL[g]}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Período</span>
                {granularidad === "dia" && (
                  <input
                    type="date"
                    value={periodoDia}
                    onChange={(e) => setPeriodoDia(e.target.value)}
                    className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                  />
                )}
                {granularidad === "semana" && (
                  <input
                    type="week"
                    value={periodoSemana}
                    onChange={(e) => setPeriodoSemana(e.target.value)}
                    className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                  />
                )}
                {granularidad === "mes" && (
                  <input
                    type="month"
                    value={periodoMes}
                    onChange={(e) => setPeriodoMes(e.target.value)}
                    className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                  />
                )}
                {granularidad === "anio" && (
                  <input
                    type="number"
                    min={2020}
                    max={2100}
                    value={periodoAnio}
                    onChange={(e) => setPeriodoAnio(e.target.value)}
                    className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                  />
                )}
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Monto</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm font-mono focus:outline-none focus:border-cyan"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs sm:col-span-2 lg:col-span-2">
                <span className="text-muted-foreground font-mono uppercase tracking-wider">Nota (opcional)</span>
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  className="bg-background/70 border border-white/10 rounded px-2 py-2 text-sm focus:outline-none focus:border-cyan"
                />
              </label>

              <div className="flex items-end">
                <button
                  onClick={submit}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-2 font-mono text-xs text-cyan hover:bg-cyan/20"
                >
                  <Plus className="size-3.5" /> Cargar
                </button>
              </div>
            </div>
            {fechaAncla && (
              <p className="mt-3 text-[10px] font-mono text-muted-foreground">
                Se va a imputar al {fechaAncla}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-panel/40 overflow-hidden">
            <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-mono uppercase tracking-wider text-sm">Registros cargados</h2>
              <span className="font-mono text-[10px] text-muted-foreground">{entries.length} registro(s)</span>
            </header>
            {sorted.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Todavía no cargaste ningún dato manual.</p>
            ) : (
              <div className="overflow-x-auto scrollbar-cyan">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-white/10">
                      <th className="text-left px-4 py-3">Fecha</th>
                      <th className="text-left px-4 py-3">Local</th>
                      <th className="text-left px-4 py-3">Categoría</th>
                      <th className="text-left px-4 py-3">Período</th>
                      <th className="text-right px-4 py-3">Monto</th>
                      <th className="text-left px-4 py-3">Nota</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((e) => (
                      <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="px-4 py-2 font-mono text-xs">{e.fecha}</td>
                        <td className="px-4 py-2 text-xs">{e.local}</td>
                        <td className="px-4 py-2 text-xs">
                          {MANUAL_CONCEPTOS.find((c) => c.concepto === e.concepto)?.label ?? e.concepto}
                        </td>
                        <td className="px-4 py-2 text-xs">{GRANULARIDAD_LABEL[e.granularidad]}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">{fmtMoney(e.monto)}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{e.nota ?? "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-foreground" title="Eliminar">
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {entries.length > 0 && (
              <div className="px-5 py-3 border-t border-white/10 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10px] text-muted-foreground">
                {[...totalPorConcepto.entries()].map(([c, v]) => (
                  <span key={c}>
                    {MANUAL_CONCEPTOS.find((m) => m.concepto === c)?.label ?? c}: {fmtMoney(v)}
                  </span>
                ))}
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
