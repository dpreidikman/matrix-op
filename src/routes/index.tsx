import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Upload, Activity, Zap, TrendingUp, AlertTriangle, Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { parseMatrix, demoData, type MatrixData } from "@/lib/matrixParser";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MATRIX // Control Financiero Gastronómico" },
      { name: "description", content: "Dashboard P&L por local con drill-down en tiempo real." },
      { property: "og:title", content: "MATRIX // Control Financiero" },
      { property: "og:description", content: "Dashboard P&L por local con drill-down en tiempo real." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@500;700;900&display=swap",
      },
    ],
  }),
  component: Index,
});

const fmtMoney = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR");
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";

function Index() {
  const [data, setData] = useState<MatrixData>(demoData);
  const [activeLocal, setActiveLocal] = useState<string>("ALL");
  const [selectedConcept, setSelectedConcept] = useState<string>(demoData.pyl[1]?.concepto ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f?: File | null) => {
    if (!f) return;
    try {
      const parsed = await parseMatrix(f);
      setData(parsed);
      setActiveLocal("ALL");
      setSelectedConcept(parsed.pyl[1]?.concepto ?? "");
      toast.success(`Matrix cargado: ${parsed.locales.length} locales`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo parsear el archivo");
    }
  };

  const localesView = activeLocal === "ALL" ? data.locales : [activeLocal];

  const filteredDetail = useMemo(
    () =>
      data.detalle.filter(
        (d) =>
          (activeLocal === "ALL" || d.local === activeLocal) &&
          (!selectedConcept || d.categoria === selectedConcept || true)
      ),
    [data.detalle, activeLocal, selectedConcept]
  );

  const maxVar = Math.max(...data.detalle.map((d) => Math.abs(d.variacion)), 0.001);

  return (
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Ambient grid + glow */}
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none fixed -top-40 -right-40 size-[600px] rounded-full bg-cyan/20 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-60 -left-40 size-[700px] rounded-full bg-magenta/15 blur-3xl" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-[0.07]">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan to-transparent animate-[scanline_8s_linear_infinite]" />
      </div>

      <div className="relative flex min-h-screen">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* SIDEBAR */}
        <aside
          className={`fixed left-0 top-0 z-40 h-full w-64 border-r border-white/10 bg-background/70 backdrop-blur-xl p-5 flex flex-col gap-8 transition-transform duration-300 lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative size-7 rounded-md bg-cyan/20 ring-1 ring-cyan/40 grid place-items-center">
                <div className="size-2 rounded-full bg-cyan animate-[pulse-glow_2s_ease-in-out_infinite] shadow-[0_0_12px_var(--color-cyan)]" />
              </div>
              <div>
                <div className="font-display text-base font-black tracking-[0.18em] text-glow text-cyan">
                  MATRIX
                </div>
                <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  v2.4 // P&L OS
                </div>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="flex flex-col gap-1 overflow-y-auto pr-1 -mr-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 px-2">
              Entities
            </div>
            <button
              onClick={() => { setActiveLocal("ALL"); setSidebarOpen(false); }}
              className={`text-left px-3 py-2.5 rounded-md text-sm font-medium transition-all border ${
                activeLocal === "ALL"
                  ? "bg-cyan/10 border-cyan/30 text-cyan ring-glow"
                  : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-cyan animate-pulse" />
                  <span>Grupo · Consolidado</span>
                </div>
                {activeLocal === "ALL" && (
                  <span className="text-[9px] font-mono text-cyan">ACTIVE</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span>{data.locales.length} locales</span>
                <span>·</span>
                <span>{fmtMoney(data.kpis.find(k => /venta/i.test(k.label))?.value ?? 0)}</span>
              </div>
            </button>

            <div className="mt-2 mb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground px-2">
              Locales
            </div>
            {data.locales.map((l) => {
              const ventaLocal = data.pyl.find(p => /venta/i.test(p.concepto))?.porLocal[l] ?? 0;
              const margenLocal = data.pyl.find(p => /margen/i.test(p.concepto))?.porLocal[l] ?? 0;
              const margenPct = ventaLocal ? margenLocal / ventaLocal : 0;
              const isActive = activeLocal === l;
              const statusColor = margenPct >= 0.18 ? "bg-lime" : margenPct >= 0.10 ? "bg-amber" : "bg-magenta";
              return (
                <button
                  key={l}
                  onClick={() => { setActiveLocal(l); setSidebarOpen(false); }}
                  className={`text-left px-3 py-2.5 rounded-md text-sm transition-all border ${
                    isActive
                      ? "bg-cyan/10 border-cyan/30 text-cyan"
                      : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`size-1.5 rounded-full ${statusColor} ${isActive ? "animate-pulse" : ""}`} />
                      <span>{l}</span>
                    </div>
                    {isActive && (
                      <span className="text-[9px] font-mono text-cyan">ACTIVE</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <span>{fmtMoney(ventaLocal)}</span>
                    <span>·</span>
                    <span className={margenPct >= 0.18 ? "text-lime" : margenPct >= 0.10 ? "text-amber" : "text-magenta"}>
                      {fmtPct(margenPct)}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-lg border border-white/10 bg-panel/60 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              Sync · Periodo
            </div>
            <div className="font-mono text-sm">
              {data.periodo.mes} {data.periodo.anio}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-lime">
              <span className="size-1.5 rounded-full bg-lime animate-[pulse-glow_1.5s_ease-in-out_infinite] shadow-[0_0_8px_currentColor]" />
              ONLINE · 12ms
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 min-w-0 w-full p-4 lg:ml-64 lg:p-8 max-w-[1600px]">
          {/* HEADER */}
          <header className="flex flex-wrap items-end justify-between gap-4 mb-8 pb-6 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-cyan/80 mb-2">
                <Activity className="size-3" /> Financial Control Terminal
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-md border border-white/10 text-muted-foreground hover:text-cyan hover:border-cyan/40 transition-all"
                >
                  <Menu className="size-4" />
                </button>
                <h1 className="font-display text-2xl lg:text-3xl font-black tracking-tight text-glow">
                  {activeLocal === "ALL" ? "GRUPO · MATRIX" : activeLocal.toUpperCase()}
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground font-mono">
                Consolidated P&L · drill-down activo · refresh 14:22:01
              </p>
            </div>

            <div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="group relative overflow-hidden rounded-lg border border-cyan/40 bg-cyan/5 px-4 lg:px-5 py-2.5 lg:py-3 font-mono text-sm text-cyan transition-all hover:bg-cyan/15 hover:ring-glow"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-cyan/0 via-cyan/20 to-cyan/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center gap-2">
                  <Upload className="size-4" />
                  <span className="hidden sm:inline">UPLOAD_MATRIX.XLSX</span>
                  <span className="sm:hidden">UPLOAD</span>
                </span>
              </button>
            </div>
          </header>

          {/* KPI GRID */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {data.kpis.map((k, i) => {
              const accent = ["cyan", "amber", "magenta", "lime"][i % 4];
              const accentClass: Record<string, string> = {
                cyan: "text-cyan",
                amber: "text-amber",
                magenta: "text-magenta",
                lime: "text-lime",
              };
              return (
                <div
                  key={k.label}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-panel/60 backdrop-blur p-5 hover:border-white/20 transition-all"
                >
                  <div className={`absolute top-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-current to-transparent ${accentClass[accent]}`} />
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      {k.label}
                    </div>
                    <Zap className={`size-3 ${accentClass[accent]}`} />
                  </div>
                  <div className="font-mono text-2xl font-bold tabular-nums">
                    {k.pct != null && k.label !== "Margen Operativo" ? fmtPct(k.pct) : fmtMoney(k.value)}
                  </div>
                  {k.delta != null && (
                    <div
                      className={`mt-2 inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        k.delta >= 0
                          ? "bg-lime/10 text-lime"
                          : "bg-magenta/10 text-magenta"
                      }`}
                    >
                      <TrendingUp className="size-3" />
                      {k.delta >= 0 ? "+" : ""}
                      {fmtPct(k.delta)} vs proyección
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* P&L MATRIX */}
          <section className="mb-8 rounded-xl border border-white/10 bg-panel/40 backdrop-blur overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="size-2 rounded-full bg-cyan animate-[pulse-glow_2s_ease-in-out_infinite] shadow-[0_0_10px_currentColor]" />
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  P&L_BY_LOCATION_MATRIX
                </span>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {data.pyl.length} rows · {localesView.length} cols
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-cyan">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sticky left-0 bg-panel/80 backdrop-blur z-10">
                      Concepto
                    </th>
                    {localesView.map((l) => (
                      <th
                        key={l}
                        className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right"
                      >
                        {l}
                      </th>
                    ))}
                    <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-cyan text-right bg-cyan/5">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono text-sm">
                  {(() => {
                    // Identificar grupos con hijos para saber qué es desplegable.
                    const hasChildren = new Set<string>();
                    data.pyl.forEach((r) => {
                      if (r.grupo) hasChildren.add(r.grupo);
                    });
                    return data.pyl
                      .filter((row) => {
                        if (row.esGrupo) return true;
                        // Hijo: ocultar si su grupo está colapsado (default colapsado).
                        const c = collapsed[row.grupo ?? ""] ?? true;
                        return !c;
                      })
                      .map((row) => {
                        const isSel = row.concepto === selectedConcept;
                        const isGroup = !!row.esGrupo;
                        const expandable = isGroup && hasChildren.has(row.concepto);
                        const isOpen = expandable
                          ? !(collapsed[row.concepto] ?? true)
                          : false;
                        return (
                          <tr
                            key={row.concepto}
                            onClick={() => {
                              setSelectedConcept(row.concepto);
                              if (expandable) {
                                setCollapsed((s) => ({
                                  ...s,
                                  [row.concepto]: !(s[row.concepto] ?? true)
                                    ? true
                                    : false,
                                }));
                              }
                            }}
                            className={`border-b border-white/5 cursor-pointer transition-colors ${
                              isGroup
                                ? "bg-cyan/[0.06] font-bold border-l-2 border-l-cyan/60"
                                : "hover:bg-cyan/[0.04] text-muted-foreground"
                            } ${isSel ? "bg-cyan/10 hover:bg-cyan/10" : ""}`}
                          >
                            <td
                              className={`px-5 py-3 sticky left-0 z-10 ${
                                isGroup ? "bg-panel-2/95" : "bg-panel/80 pl-10"
                              } backdrop-blur ${isSel ? "text-cyan" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                {expandable ? (
                                  isOpen ? (
                                    <ChevronDown className="size-3.5 text-cyan" />
                                  ) : (
                                    <ChevronRight className="size-3.5 text-cyan" />
                                  )
                                ) : isGroup ? (
                                  <span className="size-1.5 rounded-full bg-cyan/60 inline-block" />
                                ) : null}
                                <span
                                  className={
                                    isGroup
                                      ? "uppercase tracking-wider text-xs text-cyan"
                                      : ""
                                  }
                                >
                                  {row.concepto}
                                </span>
                              </div>
                            </td>
                            {localesView.map((l) => {
                              const v = row.porLocal[l] ?? 0;
                              const ratio = row.total ? v / row.total : 0;
                              return (
                                <td
                                  key={l}
                                  className={`px-5 py-3 text-right tabular-nums relative ${
                                    isGroup ? "text-foreground" : ""
                                  }`}
                                  style={{
                                    background: isGroup
                                      ? undefined
                                      : `linear-gradient(to left, color-mix(in oklab, var(--color-cyan) ${
                                          ratio * 22
                                        }%, transparent), transparent 70%)`,
                                  }}
                                >
                                  {fmtMoney(v)}
                                </td>
                              );
                            })}
                            <td
                              className={`px-5 py-3 text-right tabular-nums bg-cyan/5 ${
                                isGroup ? "text-cyan font-bold" : ""
                              }`}
                            >
                              {fmtMoney(row.total)}
                            </td>
                          </tr>
                        );
                      });
                  })()}
                </tbody>
              </table>
            </div>
          </section>

          {/* DRILL DOWN */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-white/10 bg-panel/60 backdrop-blur p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    Drill-Down · Proyección vs Real
                  </div>
                  <h3 className="font-display text-xl font-bold tracking-wide mt-1">
                    {selectedConcept || "—"}
                  </h3>
                </div>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className="px-2 py-1 rounded bg-cyan/10 text-cyan">REAL</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-muted-foreground">PROYECTADO</span>
                </div>
              </div>

              <div className="space-y-4">
                {filteredDetail.slice(0, 8).map((d, i) => {
                  const projPct = d.proyectado / Math.max(d.real, d.proyectado, 1);
                  const realPct = d.real / Math.max(d.real, d.proyectado, 1);
                  const over = d.variacion > 0.05;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs font-mono mb-1.5">
                        <span className="text-foreground">
                          {d.categoria} <span className="text-muted-foreground">· {d.local}</span>
                        </span>
                        <span className="flex gap-3 tabular-nums">
                          <span className="text-muted-foreground">{fmtMoney(d.proyectado)}</span>
                          <span className={over ? "text-magenta" : "text-cyan"}>
                            {fmtMoney(d.real)}
                          </span>
                          <span
                            className={`w-14 text-right ${
                              over ? "text-magenta" : d.variacion < -0.05 ? "text-lime" : "text-muted-foreground"
                            }`}
                          >
                            {d.variacion >= 0 ? "+" : ""}
                            {fmtPct(d.variacion)}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-white/15"
                          style={{ width: `${projPct * 100}%` }}
                        />
                        <div
                          className={`absolute inset-y-0 left-0 ${
                            over ? "bg-magenta shadow-[0_0_10px_var(--color-magenta)]" : "bg-cyan shadow-[0_0_10px_var(--color-cyan)]"
                          }`}
                          style={{ width: `${realPct * 100}%`, mixBlendMode: "screen" }}
                        />
                      </div>
                    </div>
                  );
                })}
                {filteredDetail.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm font-mono">
                    Sin datos de detalle para este concepto.
                  </div>
                )}
              </div>
            </div>

            {/* ALERTAS */}
            <div className="rounded-xl border border-white/10 bg-gradient-to-b from-panel/80 to-panel-2/40 backdrop-blur p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="size-4 text-amber" />
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  Anomalías Detectadas
                </div>
              </div>
              <div className="space-y-3 flex-1">
                {data.detalle
                  .filter((d) => Math.abs(d.variacion) > 0.08)
                  .slice(0, 4)
                  .map((d, i) => {
                    const crit = Math.abs(d.variacion) > 0.12;
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 ${
                          crit
                            ? "border-magenta/30 bg-magenta/5"
                            : "border-amber/30 bg-amber/5"
                        }`}
                      >
                        <div
                          className={`text-[9px] font-mono font-bold mb-1 ${
                            crit ? "text-magenta" : "text-amber"
                          }`}
                        >
                          {crit ? "CRÍTICO" : "ALERTA"} · {fmtPct(d.variacion)}
                        </div>
                        <div className="text-xs text-foreground/90">
                          {d.categoria} en{" "}
                          <span className="text-cyan">{d.local}</span> desviado{" "}
                          {d.variacion > 0 ? "sobre" : "bajo"} proyección.
                        </div>
                      </div>
                    );
                  })}
                {data.detalle.every((d) => Math.abs(d.variacion) <= 0.08) && (
                  <div className="rounded-lg border border-lime/30 bg-lime/5 p-3">
                    <div className="text-[9px] font-mono font-bold mb-1 text-lime">
                      OK · DENTRO DE PARÁMETROS
                    </div>
                    <div className="text-xs text-foreground/80">
                      Todas las categorías dentro del ±8% de proyección.
                    </div>
                  </div>
                )}
              </div>

              <button className="mt-4 w-full py-2 rounded-md border border-white/10 hover:border-cyan/40 hover:bg-cyan/5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-cyan transition-all">
                Export · Report.pdf
              </button>
            </div>
          </section>

          <footer className="mt-12 pt-6 border-t border-white/10 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>MATRIX // P&L Operating System</span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-cyan animate-[pulse-glow_2s_ease-in-out_infinite]" />
              SECURE_CHANNEL · ENCRYPTED
            </span>
          </footer>
        </main>
      </div>

      <Toaster theme="dark" />
    </div>
  );
}
