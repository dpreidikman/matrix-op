import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Menu, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { getVinsonSales, type VinsonShift } from "@/lib/vinson.functions";

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
  const [date, setDate] = useState<string>(todayIso());
  const fetchSales = useServerFn(getVinsonSales);

  const mutation = useMutation({
    mutationFn: () => fetchSales({ data: { idTienda: storeId, date } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const shifts: VinsonShift[] = mutation.data?.shifts ?? [];
  const total = shifts.reduce((acc, s) => acc + Number(s.sale ?? 0), 0);
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
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Fecha
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-md border border-white/10 bg-panel/60 px-3 py-2 text-sm font-mono"
                />
              </div>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-cyan/20 border border-cyan/40 px-4 py-2 text-sm font-medium text-cyan hover:bg-cyan/30 disabled:opacity-50"
              >
                <RefreshCw className={`size-4 ${mutation.isPending ? "animate-spin" : ""}`} />
                Consultar
              </button>
            </div>
          </header>

          <section className="rounded-lg border border-white/10 bg-panel/40 backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="font-display text-sm tracking-widest text-muted-foreground">
                TURNOS · {date}
              </div>
              <div className="font-mono text-sm text-cyan">
                TOTAL {fmtMoney(total)}
              </div>
            </div>

            {mutation.isPending && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Cargando…
              </div>
            )}

            {!mutation.isPending && mutation.isError && (
              <div className="px-5 py-6 text-sm text-magenta">
                {(mutation.error as Error).message}
              </div>
            )}

            {!mutation.isPending && !mutation.isError && shifts.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {mutation.isSuccess
                  ? (mutation.data?.warning ?? "Sin datos para esa fecha.")
                  : "Elegí una fecha y presioná Consultar."}
              </div>
            )}

            {shifts.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <th className="px-5 py-3">Turno</th>
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-5 py-3 text-right">Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-5 py-3">{s.shift}</td>
                      <td className="px-5 py-3 font-mono text-muted-foreground">{s.date}</td>
                      <td className="px-5 py-3 text-right font-mono text-cyan">
                        {fmtMoney(Number(s.sale))}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 bg-white/5">
                    <td className="px-5 py-3 font-medium" colSpan={2}>Total</td>
                    <td className="px-5 py-3 text-right font-mono text-cyan font-medium">
                      {fmtMoney(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}