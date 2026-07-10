import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Menu, X, Database } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  getVinsonHistory,
  syncVinsonRange,
} from "@/lib/vinson.functions";

const STORES = [
  { id: 643, name: "La Mala" },
  { id: 695, name: "Costa 7070" },
  { id: 73, name: "Narda Comedor" },
  { id: 363, name: "Kona" },
] as const;

export const Route = createFileRoute("/vinson")({
  head: () => ({
    meta: [
      { title: "VINSON // Ventas por Turno" },
      { name: "description", content: "Ventas por tienda y turno desde la API de Vinson." },
    ],
  }),
  component: VinsonPage,
});

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function VinsonPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeId, setStoreId] = useState<number>(STORES[0].id);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string>("");
  const runSync = useServerFn(syncVinsonRange);
  const fetchHistory = useServerFn(getVinsonHistory);
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: ["vinson", "history", storeId],
    queryFn: () => fetchHistory({ data: { storeId } }),
    staleTime: 30_000,
  });

  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of historyQuery.data?.rows ?? []) {
      if (/^\d{4}-\d{2}/.test(r.date)) set.add(r.date.slice(0, 7));
    }
    return [...set].sort();
  }, [historyQuery.data]);

  const monthRange = (ym: string): [string, string] => {
    const [y, m] = ym.split("-").map(Number);
    const first = `${ym}-01`;
    const last = new Date(y, m, 0).getDate();
    return [first, `${ym}-${String(last).padStart(2, "0")}`];
  };

  const selectedMonth =
    periodFrom && periodTo && periodFrom.slice(0, 7) === periodTo.slice(0, 7)
      ? periodFrom.slice(0, 7)
      : "";

  const MES_LABELS = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return `${MES_LABELS[m - 1]} ${y}`;
  };

  const filtered = useMemo(() => {
    const rows = (historyQuery.data?.rows ?? []).filter(
      (r) => (!periodFrom || r.date >= periodFrom) && (!periodTo || r.date <= periodTo),
    );
    const total = rows.reduce((s, r) => s + r.total, 0);
    return { rows, total };
  }, [historyQuery.data, periodFrom, periodTo]);

  function isoAdd(iso: string, days: number) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function backfill2026() {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg("Iniciando…");
    try {
      const today = todayIso();
      const rows = historyQuery.data?.rows ?? [];
      const lastCached = rows.length
        ? rows.map((r) => r.date).sort().at(-1)!
        : null;
      let cursor = lastCached ? isoAdd(lastCached, 1) : "2026-01-01";
      if (cursor > today) {
        setSyncMsg("Ya está al día.");
        return;
      }
      let totalSynced = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      const CHUNK = 20;
      while (cursor <= today) {
        const chunkEnd = isoAdd(cursor, CHUNK - 1);
        const to = chunkEnd > today ? today : chunkEnd;
        setSyncMsg(`Sincronizando ${cursor} → ${to} (${totalSynced} guardados)`);
        const r = await runSync({ data: { storeId, from: cursor, to } });
        totalSynced += r.synced;
        totalSkipped += r.skipped;
        totalFailed += r.failed;
        cursor = isoAdd(to, 1);
      }
      setSyncMsg(
        `Listo · ${totalSynced} nuevos · ${totalSkipped} en caché · ${totalFailed} sin datos`,
      );
      if (totalSynced > 0) toast.success(`Sincronizados ${totalSynced} días nuevos`);
      queryClient.invalidateQueries({ queryKey: ["vinson", "history", storeId] });
    } catch (e) {
      toast.error((e as Error).message);
      setSyncMsg("Error durante la sincronización.");
    } finally {
      setSyncing(false);
    }
  }

  // Auto-sync missing days up to today, once per store per session.
  const autoRan = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (historyQuery.isLoading || syncing) return;
    if (autoRan.current.has(storeId)) return;
    const rows = historyQuery.data?.rows ?? [];
    const today = todayIso();
    const lastCached = rows.length ? rows.map((r) => r.date).sort().at(-1)! : null;
    if (!lastCached || lastCached < today) {
      autoRan.current.add(storeId);
      backfill2026();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, historyQuery.data, historyQuery.isLoading]);

  const store = STORES.find((s) => s.id === storeId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <div className="relative flex min-h-screen">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

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
              Módulos
            </div>
            <Link
              to="/"
              className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              Matrix · P&L
            </Link>
            <Link
              to="/vinson"
              className="text-left px-3 py-2.5 rounded-md text-sm font-medium border bg-cyan/10 border-cyan/30 text-cyan"
            >
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan animate-pulse" />
                <span>VINSON</span>
              </div>
            </Link>

            <div className="mt-4 mb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground px-2">
              Tiendas
            </div>
            {STORES.map((s) => (
              <button
                key={s.id}
                onClick={() => { setStoreId(s.id); setSidebarOpen(false); }}
                className={`text-left px-3 py-2.5 rounded-md text-sm transition-all border ${
                  storeId === s.id
                    ? "bg-cyan/10 border-cyan/30 text-cyan"
                    : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-cyan" />
                  <span>{s.name}</span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                  ID {s.id}
                </div>
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-4 lg:ml-64 lg:p-8 max-w-[1600px]">
          <header className="flex flex-wrap items-end justify-between gap-4 mb-8 pb-6 border-b border-white/10">
            <div>
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden mb-2 inline-flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground"
              >
                <Menu className="size-4" />
                Menú
              </button>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                <Activity className="size-3" />
                Vinson · Reporting API
              </div>
              <h1 className="mt-1 font-display text-3xl font-black tracking-widest text-glow text-cyan">
                VENTAS POR TURNO
              </h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {store?.name} · ID {storeId}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={backfill2026}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-md bg-magenta/20 border border-magenta/40 px-4 py-2 text-sm font-medium text-magenta hover:bg-magenta/30 disabled:opacity-50"
                title="Descarga y guarda en base de datos todos los días desde 2026-01-01 hasta hoy"
              >
                <Database className={`size-4 ${syncing ? "animate-pulse" : ""}`} />
                {syncing ? "Sincronizando…" : "Backfill 2026"}
              </button>
            </div>
          </header>

          <div className="mb-6 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan/80">
            <span className="opacity-60">Período</span>
            {availableMonths.length > 0 && (
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { setPeriodFrom(""); setPeriodTo(""); return; }
                  const [f, t] = monthRange(v);
                  setPeriodFrom(f);
                  setPeriodTo(t);
                }}
                className="bg-black/40 border border-cyan/30 rounded px-2 py-1.5 text-cyan text-xs focus:outline-none focus:border-cyan/70"
              >
                <option value="">— Mes —</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="bg-black/40 border border-cyan/30 rounded px-2 py-1.5 text-cyan text-xs focus:outline-none focus:border-cyan/70"
            />
            <span className="opacity-60">→</span>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="bg-black/40 border border-cyan/30 rounded px-2 py-1.5 text-cyan text-xs focus:outline-none focus:border-cyan/70"
            />
            <button
              onClick={() => {
                const anchor = periodFrom || periodTo || (availableMonths[availableMonths.length - 1] ? availableMonths[availableMonths.length - 1] + "-01" : "");
                if (!anchor) return;
                const [f, t] = monthRange(anchor.slice(0, 7));
                setPeriodFrom(f);
                setPeriodTo(t);
              }}
              className="text-[10px] px-2 py-1 border border-cyan/30 rounded text-cyan hover:bg-cyan/10"
            >
              MES COMPLETO
            </button>
            <button
              onClick={() => { setPeriodFrom(""); setPeriodTo(""); }}
              className="text-[10px] px-2 py-1 border border-white/10 rounded hover:border-cyan/40 hover:text-cyan text-muted-foreground"
            >
              RESET
            </button>
          </div>

          {syncMsg && (
            <div className="mb-4 rounded-md border border-magenta/30 bg-magenta/5 px-4 py-2 text-xs font-mono text-magenta">
              {syncMsg}
            </div>
          )}

          <section className="rounded-lg border border-white/10 bg-panel/40 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="font-display text-sm tracking-widest text-muted-foreground">
                HISTÓRICO EN BASE · {store?.name}
              </div>
              <div className="font-mono text-sm text-cyan">
                {historyQuery.data
                  ? `${filtered.rows.length} días · ${fmtMoney(filtered.total)}`
                  : "cargando…"}
              </div>
            </div>

            {historyQuery.isLoading && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Cargando histórico…
              </div>
            )}

            {!historyQuery.isLoading && filtered.rows.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Sin datos en el período seleccionado.
              </div>
            )}

            {filtered.rows.length > 0 && (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-panel/95 backdrop-blur">
                    <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      <th className="px-5 py-3">Fecha</th>
                      <th className="px-5 py-3 text-right">Venta</th>
                      <th className="px-5 py-3 text-right">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const asc = [...filtered.rows].sort((a, b) =>
                        a.date < b.date ? -1 : 1,
                      );
                      let running = 0;
                      const rendered = asc.map((r) => {
                        running += r.total;
                        return { ...r, running };
                      });
                      return rendered
                        .slice()
                        .reverse()
                        .map((r) => (
                          <tr key={r.date} className="border-t border-white/5">
                            <td className="px-5 py-2 font-mono text-muted-foreground">{r.date}</td>
                            <td className="px-5 py-2 text-right font-mono text-cyan">
                              {fmtMoney(r.total)}
                            </td>
                            <td className="px-5 py-2 text-right font-mono text-foreground">
                              {fmtMoney(r.running)}
                            </td>
                          </tr>
                        ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}