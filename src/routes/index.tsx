import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Activity, Zap, TrendingUp, AlertTriangle, Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { parseMatrix, parseGastosDetallados, mergeMatrixData, demoData, filterMatrixByPeriod, type GastoRow, type MatrixData } from "@/lib/matrixParser";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVinsonCachedRange } from "@/lib/vinson.functions";
import { DEFAULT_PCT, getPct, loadPctConfig, type PctConfig } from "@/lib/pctConfig";

const STORAGE_KEYS = {
  auto: "matrix:v1:auto",
  detallado: "matrix:v1:detallado",
  name: "matrix:v1:filename",
  otros: "matrix:v1:otros",
} as const;

// Mapeo de locales de la matriz a tiendas Vinson.
// El patrón se aplica sobre el nombre del local; el primero que matchee gana.
const VINSON_MAP: Array<{ pattern: RegExp; storeId: number; label: string }> = [
  { pattern: /la\s*mala/i, storeId: 643, label: "Vinson · 643" },
  { pattern: /comedor/i, storeId: 73, label: "Vinson · 73" },
];

function loadPersisted(): { data: MatrixData; name: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const rawM = localStorage.getItem(STORAGE_KEYS.auto);
    const rawG = localStorage.getItem(STORAGE_KEYS.detallado);
    const name = localStorage.getItem(STORAGE_KEYS.name) ?? "";
    const m = rawM ? (JSON.parse(rawM) as MatrixData) : null;
    const g = rawG ? (JSON.parse(rawG) as MatrixData) : null;
    if (m && g) return { data: mergeMatrixData(m, g), name };
    if (m) return { data: m, name };
    if (g) return { data: g, name };
  } catch (e) {
    console.warn("persist load failed", e);
  }
  return null;
}

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
const fmtDate = (iso?: string) => {
  if (!iso) return "SIN FECHA";
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-AR");
};

function Index() {
  const [rawData, setRawData] = useState<MatrixData>(demoData);
  const [otrosOverrides, setOtrosOverrides] = useState<Record<string, number>>({});
  const [pctCfg, setPctCfg] = useState<PctConfig>({});
  useEffect(() => {
    const p = loadPersisted();
    if (p) {
      setRawData(p.data);
      setLoadedFileName(p.name);
      setActiveLocal("ALL");
      setSelectedConcept(p.data.pyl.find((r) => !r.esGrupo)?.concepto ?? p.data.pyl[0]?.concepto ?? "");
      if (p.data.gastos?.length) {
        const dates = p.data.gastos.map((g) => g.fechaPago).filter(Boolean).sort();
        setPeriodFrom(dates[0] ?? "");
        setPeriodTo(dates[dates.length - 1] ?? "");
      }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.otros);
      if (raw) setOtrosOverrides(JSON.parse(raw));
    } catch (e) {
      console.warn("otros load failed", e);
    }
    setPctCfg(loadPctConfig());
  }, []);
  const setOtros = (local: string, val: number) => {
    setOtrosOverrides((s) => {
      const next = { ...s, [local]: val };
      try { localStorage.setItem(STORAGE_KEYS.otros, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const data = useMemo(
    () => (rawData.gastos?.length ? filterMatrixByPeriod(rawData, periodFrom, periodTo) : rawData),
    [rawData, periodFrom, periodTo],
  );
  const [activeLocal, setActiveLocal] = useState<string>("ALL");
  const [selectedConcept, setSelectedConcept] = useState<string>(demoData.pyl[1]?.concepto ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loadedFileName, setLoadedFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Meses disponibles según fechas de pago del archivo cargado
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const g of rawData.gastos ?? []) {
      if (g.fechaPago && /^\d{4}-\d{2}/.test(g.fechaPago)) set.add(g.fechaPago.slice(0, 7));
    }
    return [...set].sort();
  }, [rawData.gastos]);

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

  const handleFile = async (f?: File | null, kind: "auto" | "detallado" = "auto") => {
    if (!f) return;
    try {
      const parsed = kind === "detallado" ? await parseGastosDetallados(f) : await parseMatrix(f);
      // Persistir en el slot correspondiente y mergear con el otro slot si existe
      let combined: MatrixData = parsed;
      try {
        const slot = kind === "detallado" ? STORAGE_KEYS.detallado : STORAGE_KEYS.auto;
        const otherSlot = kind === "detallado" ? STORAGE_KEYS.auto : STORAGE_KEYS.detallado;
        localStorage.setItem(slot, JSON.stringify(parsed));
        localStorage.setItem(STORAGE_KEYS.name, f.name);
        const otherRaw = localStorage.getItem(otherSlot);
        if (otherRaw) {
          const other = JSON.parse(otherRaw) as MatrixData;
          // Base = MATRIX/semanales (kind auto), overlay = gastos detallados
          combined =
            kind === "detallado"
              ? mergeMatrixData(other, parsed)
              : mergeMatrixData(parsed, other);
        }
      } catch (e) {
        console.warn("persist save failed", e);
      }
      setRawData(combined);
      // Auto-setear rango del período detectado
      if (combined.gastos?.length) {
        const dates = combined.gastos.map((g) => g.fechaPago).filter(Boolean).sort();
        setPeriodFrom(dates[0] ?? "");
        setPeriodTo(dates[dates.length - 1] ?? "");
      } else {
        setPeriodFrom("");
        setPeriodTo("");
      }
      setActiveLocal("ALL");
      setCollapsed({});
      setLoadedFileName(f.name);
      setSelectedConcept(combined.pyl.find((p) => !p.esGrupo)?.concepto ?? combined.pyl[0]?.concepto ?? "");
      toast.success(
        parsed.origen === "gastos"
          ? `Base de gastos cargada: ${parsed.gastos?.length ?? 0} ítems · ${parsed.locales.length} locales`
          : `MATRIX cargada: ${parsed.locales.length} locales`
      );
    } catch (e) {
      console.error(e);
      toast.error("No se pudo parsear el archivo");
    }
  };

  const isGastos = data.origen === "gastos";
  const hasGastos = !!data.gastos?.length;
  const excludedSet = new Set(data.excluidosDeTotal ?? []);
  const localesView =
    activeLocal === "ALL"
      ? data.locales.filter((l) => !excludedSet.has(l))
      : [activeLocal];

  // KPIs dinámicos según el local seleccionado
  const kpisView = useMemo<typeof data.kpis>(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const findRow = (re: RegExp) =>
      data.pyl.find((p) => re.test(norm(p.concepto)));
    const valOf = (re: RegExp) => {
      const r = findRow(re);
      if (!r) return 0;
      if (activeLocal === "ALL") return r.total ?? 0;
      return r.porLocal[activeLocal] ?? 0;
    };
    if (hasGastos) {
      const total = valOf(/^total\s*gastos$/);
      const dj = valOf(/dj\s*y\s*bandas/);
      const pr = valOf(/^total\s*pr$/);
      const bailarinas = valOf(/bailarinas/);
      const totalFromPyl = total || data.pyl
        .filter((p) => p.esGrupo && p.concepto !== "TOTAL GASTOS")
        .reduce((s, p) => s + (activeLocal === "ALL" ? p.total : p.porLocal[activeLocal] ?? 0), 0);
      return [
        { label: "Total Gastos", value: totalFromPyl },
        { label: "DJ y Bandas", value: dj, pct: totalFromPyl ? dj / totalFromPyl : 0 },
        { label: "PR", value: pr, pct: totalFromPyl ? pr / totalFromPyl : 0 },
        { label: "Bailarinas", value: bailarinas, pct: totalFromPyl ? bailarinas / totalFromPyl : 0 },
      ];
    }
    if (activeLocal === "ALL") return data.kpis;
    const venta =
      valOf(/^total\s*ingresos/) ||
      valOf(/^total\s*venta\s*neta/) ||
      valOf(/venta\s*neta/) ||
      valOf(/^venta\s*bruta/) ||
      valOf(/venta|ingreso/);
    const cmv = valOf(/^cmv\b|costo.*mercader|food.*cost/);
    const laboral = valOf(/^costo\s*laboral|mano.*obra/);
    const margenVal = venta - cmv - laboral;
    const margenPct = venta ? margenVal / venta : 0;
    const proyVenta = data.proyecciones?.[activeLocal];
    const deltaVenta =
      proyVenta && venta ? (venta - proyVenta) / venta : undefined;
    return [
      { label: "Venta Neta", value: venta, delta: deltaVenta },
      { label: "CMV", value: cmv, pct: venta ? cmv / venta : 0 },
      { label: "Costo Laboral", value: laboral, pct: venta ? laboral / venta : 0 },
      { label: "Margen Operativo", value: margenVal, pct: margenPct },
    ];
  }, [data, activeLocal, hasGastos]);

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

  // Vinson: read cached daily totals from DB (populated by cron + manual sync).
  const fetchCached = useServerFn(getVinsonCachedRange);
  const vinsonQueries = useQueries({
    queries: VINSON_MAP.map((v) => ({
      queryKey: ["vinson", "cached", v.storeId, periodFrom, periodTo],
      queryFn: () => fetchCached({ data: { storeId: v.storeId, from: periodFrom, to: periodTo } }),
      enabled: Boolean(periodFrom && periodTo),
      staleTime: 60_000,
    })),
  });
  const vinsonByLocal = useMemo(() => {
    const map = new Map<string, { total: number; isFetching: boolean; label: string; storeId: number }>();
    VINSON_MAP.forEach((v, i) => {
      const local = data.locales.find((l) => v.pattern.test(l));
      if (!local) return;
      const q = vinsonQueries[i];
      map.set(local, {
        total: q?.data?.total ?? 0,
        isFetching: !!q?.isFetching,
        label: v.label,
        storeId: v.storeId,
      });
    });
    return map;
  }, [data.locales, vinsonQueries]);

  // Mes efectivo para elegir los % (usa el mes de periodFrom; fallback default).
  const pctYm = periodFrom ? periodFrom.slice(0, 7) : "";
  const pctFor = (local: string) => (pctYm ? getPct(pctCfg, local, pctYm) : DEFAULT_PCT);

  const ventaBruta = useMemo(() => {
    const vf = data.pyl.find((p) => /^venta\s*f\b/i.test(p.concepto));
    const vnf = data.pyl.find((p) => /^venta\s*nf\b/i.test(p.concepto));
    const oi = data.pyl.find((p) => /otros\s*ingresos/i.test(p.concepto));
    const proy =
      data.pyl.find((p) => /total.*venta.*proyect/i.test(p.concepto)) ??
      data.pyl.find((p) => /venta.*proyect/i.test(p.concepto)) ??
      data.pyl.find((p) => /proyect/i.test(p.concepto));
    const proyMap = data.proyecciones ?? {};
    const tvb = data.pyl.find((p) => /total\s*venta\s*bruta/i.test(p.concepto));
    const localesToShow =
      activeLocal === "ALL"
        ? data.locales.filter((l) => !excludedSet.has(l))
        : [activeLocal];
    const rows = localesToShow.map((loc) => {
      let f = vf?.porLocal[loc] ?? 0;
      let nf = vnf?.porLocal[loc] ?? 0;
      const o = otrosOverrides[loc] ?? oi?.porLocal[loc] ?? 0;
      let real = tvb?.porLocal[loc] ?? f + nf + o;
      const info = vinsonByLocal.get(loc);
      const fromVinson = !!info && (info.total > 0 || info.isFetching);
      let vinsonLabel: string | undefined;
      if (info && (info.total > 0 || info.isFetching)) {
        real = info.total;
        vinsonLabel = info.label;
        // VENTA F/NF = TVB * % configurado por local+mes ; OTROS INGRESOS = manual.
        const p = pctFor(loc);
        f = real * (p.f / 100);
        nf = real * (p.nf / 100);
      }
      const segSum = f + nf + o;
      const proyectadoRaw = proyMap[loc] ?? proy?.porLocal[loc];
      const proyectado = proyectadoRaw ?? 0;
      const hasProy = proyectadoRaw !== undefined && proyectadoRaw !== 0;
      const variacion = hasProy && real ? (real - proyectado) / real : 0;
      return { local: loc, f, nf, o, segSum, real, proyectado, hasProy, variacion, fromVinson, vinsonLabel };
    });
    return { rows };
  }, [data, activeLocal, vinsonByLocal, otrosOverrides, excludedSet, pctCfg, pctYm]);

  // Overrides para la matriz P&L: cuando Vinson trae ventas de LA MALA,
  // derivamos TOTAL VENTA BRUTA, VENTA F, VENTA NF y TOTAL INGRESOS para esa columna.
  // OTROS INGRESOS se mantiene como valor manual del archivo.
  const otrosRow = useMemo(
    () => data.pyl.find((p) => /otros\s*ingresos/i.test(p.concepto)),
    [data.pyl],
  );

  const cellOverrides = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    const set = (concepto: string, local: string, value: number) => {
      const inner = map.get(concepto) ?? new Map<string, number>();
      inner.set(local, value);
      map.set(concepto, inner);
    };
    // Overrides manuales de OTROS INGRESOS por local
    if (otrosRow) {
      for (const [loc, val] of Object.entries(otrosOverrides)) {
        set(otrosRow.concepto, loc, val);
      }
    }
    const getOtros = (loc: string) =>
      otrosOverrides[loc] ?? otrosRow?.porLocal[loc] ?? 0;
    // Overrides derivados de Vinson por local mapeado
    for (const [loc, info] of vinsonByLocal) {
      if (!(info.total > 0)) continue;
      const tvb = info.total;
      const p = pctFor(loc);
      const f = tvb * (p.f / 100);
      const nf = tvb * (p.nf / 100);
      const o = getOtros(loc);
      for (const row of data.pyl) {
        if (/total\s*venta\s*bruta/i.test(row.concepto)) set(row.concepto, loc, tvb);
        else if (/^venta\s*f\b/i.test(row.concepto)) set(row.concepto, loc, f);
        else if (/^venta\s*nf\b/i.test(row.concepto)) set(row.concepto, loc, nf);
        else if (/total\s*ingresos/i.test(row.concepto)) set(row.concepto, loc, f + nf + o);
      }
    }
    return map;
  }, [data, vinsonByLocal, otrosOverrides, otrosRow, pctCfg, pctYm]);

  const getCell = (concepto: string, local: string, original: number) =>
    cellOverrides.get(concepto)?.get(local) ?? original;
  const getRowTotal = (row: MatrixData["pyl"][number]) => {
    const ov = cellOverrides.get(row.concepto);
    if (!ov) return row.total;
    let t = row.total;
    for (const [loc, val] of ov) {
      t = t - (row.porLocal[loc] ?? 0) + val;
    }
    return t;
  };

  const gastosResumen = useMemo(() => {
    const rows = data.pyl
      .filter((p) => p.esGrupo && p.concepto !== "TOTAL GASTOS")
      .map((p) => ({
        concepto: p.concepto,
        total: activeLocal === "ALL" ? p.total : p.porLocal[activeLocal] ?? 0,
      }))
      .filter((p) => p.total > 0);
    return { rows, max: Math.max(...rows.map((r) => r.total), 1) };
  }, [data, activeLocal]);

  const gastosDetalle = useMemo<GastoRow[]>(() => {
    return (data.gastos ?? [])
      .filter((g) => activeLocal === "ALL" || g.local === activeLocal)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);
  }, [data.gastos, activeLocal]);

  const gastosCount = useMemo(
    () => (data.gastos ?? []).filter((g) => activeLocal === "ALL" || g.local === activeLocal).length,
    [data.gastos, activeLocal],
  );

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
              Módulos
            </div>
            <Link
              to="/"
              className="text-left px-3 py-2.5 rounded-md text-sm font-medium border bg-cyan/10 border-cyan/30 text-cyan"
            >
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan animate-pulse" />
                <span>Matrix · P&amp;L</span>
              </div>
            </Link>
            <Link
              to="/percentages"
              className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              % Venta F / NF
            </Link>
            <Link
              to="/vinson"
              className="text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              VINSON
            </Link>

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
                <span>{fmtMoney(data.kpis.find(k => isGastos ? /total gastos/i.test(k.label) : /venta/i.test(k.label))?.value ?? 0)}</span>
              </div>
            </button>

            <div className="mt-2 mb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground px-2">
              Locales
            </div>
            {data.locales.map((l) => {
              const totalLocal = isGastos
                ? data.pyl.find(p => /^total\s*gastos$/i.test(p.concepto))?.porLocal[l] ?? 0
                : data.pyl.find(p => /venta/i.test(p.concepto))?.porLocal[l] ?? 0;
              const margenLocal = data.pyl.find(p => /margen/i.test(p.concepto))?.porLocal[l] ?? 0;
              const totalBase = data.kpis[0]?.value ?? 0;
              const margenPct = isGastos
                ? (totalBase ? totalLocal / totalBase : 0)
                : (totalLocal ? margenLocal / totalLocal : 0);
              const isActive = activeLocal === l;
              const statusColor = isGastos
                ? (totalLocal > 0 ? "bg-cyan" : "bg-muted")
                : (margenPct >= 0.18 ? "bg-lime" : margenPct >= 0.10 ? "bg-amber" : "bg-magenta");
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
                    <span>{fmtMoney(totalLocal)}</span>
                    <span>·</span>
                    <span className={isGastos ? "text-cyan" : margenPct >= 0.18 ? "text-lime" : margenPct >= 0.10 ? "text-amber" : "text-magenta"}>
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
                  {activeLocal === "ALL" ? "MATRIX" : activeLocal.toUpperCase()}
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground font-mono">
                {isGastos ? "Base de gastos · imputaciones por local" : "Consolidated P&L · drill-down activo"} · refresh {now ? now.toLocaleTimeString("es-AR", { hour12: false }) : "--:--:--"}
              </p>
              {loadedFileName && (
                <p className="mt-1 text-[10px] text-cyan/70 font-mono uppercase tracking-[0.18em]">
                  Archivo activo · {loadedFileName}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan/80">
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
                    onClick={() => {
                      const dates = (rawData.gastos ?? []).map((g) => g.fechaPago).filter(Boolean).sort();
                      setPeriodFrom(dates[0] ?? "");
                      setPeriodTo(dates[dates.length - 1] ?? "");
                    }}
                    className="text-[10px] px-2 py-1 border border-white/10 rounded hover:border-cyan/40 hover:text-cyan text-muted-foreground"
                  >
                    RESET
                  </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
              <input
                ref={inputRef2}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0], "detallado");
                  e.currentTarget.value = "";
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="group relative overflow-hidden rounded-lg border border-cyan/40 bg-cyan/5 px-4 lg:px-5 py-2.5 lg:py-3 font-mono text-sm text-cyan transition-all hover:bg-cyan/15 hover:ring-glow"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-cyan/0 via-cyan/20 to-cyan/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center gap-2">
                  <Upload className="size-4" />
                  <span className="hidden sm:inline">CARGAR MATRIX / GASTOS</span>
                  <span className="sm:hidden">CARGAR</span>
                </span>
              </button>
              <button
                onClick={() => inputRef2.current?.click()}
                className="group relative overflow-hidden rounded-lg border border-magenta/40 bg-magenta/5 px-4 lg:px-5 py-2.5 lg:py-3 font-mono text-sm text-magenta transition-all hover:bg-magenta/15"
                title="Base de gastos con Fecha Servicio + Categoría/Sub-categoría"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-magenta/0 via-magenta/20 to-magenta/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center gap-2">
                  <Upload className="size-4" />
                  <span className="hidden sm:inline">CARGAR GASTOS DETALLADOS</span>
                  <span className="sm:hidden">DETALL.</span>
                </span>
              </button>
            </div>
          </header>

          {/* KPI GRID */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {kpisView.map((k, i) => {
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
                    {data.origen !== "gastos" && k.pct != null && k.label !== "Margen Operativo" ? fmtPct(k.pct) : fmtMoney(k.value)}
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
                  {data.origen === "gastos" ? "GASTOS_BY_LOCATION_MATRIX" : "P&L_BY_LOCATION_MATRIX"}
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
                                  [row.concepto]: !(s[row.concepto] ?? true),
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
                              const v = getCell(row.concepto, l, row.porLocal[l] ?? 0);
                              const rowTotal = getRowTotal(row);
                              const ratio = rowTotal ? v / rowTotal : 0;
                              const isOtros = !!otrosRow && row.concepto === otrosRow.concepto;
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
                                  {isOtros ? (
                                    <input
                                      type="number"
                                      value={otrosOverrides[l] ?? row.porLocal[l] ?? 0}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setOtros(l, Number(e.target.value) || 0)}
                                      className="w-28 bg-transparent border border-cyan/30 rounded px-2 py-1 text-right text-cyan focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan/50 tabular-nums"
                                    />
                                  ) : (
                                    fmtMoney(v)
                                  )}
                                </td>
                              );
                            })}
                            <td
                              className={`px-5 py-3 text-right tabular-nums bg-cyan/5 ${
                                isGroup ? "text-cyan font-bold" : ""
                              }`}
                            >
                              {fmtMoney(getRowTotal(row))}
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
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    {data.origen === "gastos" ? "Drill-Down · Gastos por imputación" : "Drill-Down · Proyección vs Real"}
                  </div>
                  <h3 className="font-display text-xl font-bold tracking-wide mt-1">
                    {data.origen === "gastos" ? "Gastos por Categoría" : "Venta Bruta por Local"}
                  </h3>
                </div>
                {data.origen !== "gastos" && (
                  <div className="flex gap-3 text-[10px] font-mono">
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-cyan" /><span className="text-muted-foreground">VENTA F</span></span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-magenta" /><span className="text-muted-foreground">VENTA NF</span></span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-lime" /><span className="text-muted-foreground">OTROS ING.</span></span>
                  </div>
                )}
              </div>

              {data.origen === "gastos" ? (
                <div>
                  {gastosResumen.rows.map((r, i) => {
                    const w = (r.total / gastosResumen.max) * 100;
                    const accent = i % 3 === 0 ? "bg-cyan shadow-[0_0_14px_var(--color-cyan)]" : i % 3 === 1 ? "bg-magenta shadow-[0_0_14px_var(--color-magenta)]" : "bg-lime shadow-[0_0_14px_var(--color-lime)]";
                    return (
                      <div key={r.concepto} className="mb-5 last:mb-0">
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <div className="text-xs font-mono uppercase tracking-[0.2em] text-foreground">
                            {r.concepto}
                          </div>
                          <div className="font-mono text-sm font-bold tabular-nums text-cyan">
                            {fmtMoney(r.total)}
                          </div>
                        </div>
                        <div className="h-5 rounded bg-white/5 ring-1 ring-white/10 overflow-hidden">
                          <div
                            title={`${r.concepto}: ${fmtMoney(r.total)}`}
                            className={`h-full ${accent} flex items-center justify-center text-[10px] font-mono font-bold text-background tabular-nums px-2 whitespace-nowrap`}
                            style={{ width: `${w}%` }}
                          >
                            {w > 18 ? fmtMoney(r.total) : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {gastosResumen.rows.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm font-mono">
                      Sin gastos para el filtro seleccionado.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {ventaBruta.rows.map((r, i) => {
                  const denom = r.segSum || 1;
                  const fPct = (r.f / denom) * 100;
                  const nfPct = (r.nf / denom) * 100;
                  const oPct = (r.o / denom) * 100;
                  const positive = r.variacion >= 0;
                  return (
                    <div key={i} className="mb-6 last:mb-0">
                      <div className="text-xs font-mono uppercase tracking-[0.2em] text-foreground mb-1.5">
                        {r.local}
                      </div>
                      <div className="flex items-center gap-6 flex-wrap lg:flex-nowrap">
                        {/* Stacked bar */}
                        <div className="flex-1 min-w-[240px]">
                          <div className="relative h-6 rounded bg-white/5 ring-1 ring-white/10 overflow-hidden flex">
                          {r.f > 0 && (
                            <div
                              title={`Venta F: ${fmtMoney(r.f)}`}
                              className="h-full bg-cyan/90 shadow-[0_0_14px_var(--color-cyan)] hover:bg-cyan transition-colors flex items-center justify-center text-[10px] font-mono font-bold text-background tabular-nums px-1 overflow-hidden whitespace-nowrap"
                              style={{ width: `${fPct}%` }}
                            >
                              {fPct > 10 ? fmtMoney(r.f) : ""}
                            </div>
                          )}
                          {r.nf > 0 && (
                            <div
                              title={`Venta NF: ${fmtMoney(r.nf)}`}
                              className="h-full bg-magenta/90 shadow-[0_0_14px_var(--color-magenta)] hover:bg-magenta transition-colors flex items-center justify-center text-[10px] font-mono font-bold text-background tabular-nums px-1 overflow-hidden whitespace-nowrap"
                              style={{ width: `${nfPct}%` }}
                            >
                              {nfPct > 10 ? fmtMoney(r.nf) : ""}
                            </div>
                          )}
                          {r.o > 0 && (
                            <div
                              title={`Otros Ingresos: ${fmtMoney(r.o)}`}
                              className="h-full bg-lime/90 shadow-[0_0_14px_var(--color-lime)] hover:bg-lime transition-colors flex items-center justify-center text-[10px] font-mono font-bold text-background tabular-nums px-1 overflow-hidden whitespace-nowrap"
                              style={{ width: `${oPct}%` }}
                            >
                              {oPct > 10 ? fmtMoney(r.o) : ""}
                            </div>
                          )}
                          </div>
                        </div>

                        {/* KPIs a la derecha (ancho fijo para barras iguales) */}
                        <div className="grid grid-cols-3 gap-5 shrink-0 w-[460px]">
                          <div className="text-right">
                            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">Total Venta Bruta</div>
                            <div className={`font-display text-base font-bold tabular-nums ${r.fromVinson ? "text-cyan" : "text-foreground"}`}>
                              {r.fromVinson && r.real === 0 ? "…" : fmtMoney(r.real)}
                            </div>
                            {r.fromVinson && r.vinsonLabel && (
                              <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-cyan/70">{r.vinsonLabel}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">Proyectado</div>
                            <div className="font-display text-base font-bold text-muted-foreground tabular-nums">{r.hasProy ? fmtMoney(r.proyectado) : "—"}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap">Variación</div>
                            <div className={`font-display text-base font-bold tabular-nums ${!r.hasProy ? "text-muted-foreground" : positive ? "text-lime" : "text-magenta"}`}>
                              {!r.hasProy ? "—" : `${r.variacion >= 0 ? "+" : ""}${fmtPct(r.variacion)}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                  {ventaBruta.rows.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm font-mono">
                      Sin datos de venta bruta.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ALERTAS */}
            <div className="rounded-xl border border-white/10 bg-gradient-to-b from-panel/80 to-panel-2/40 backdrop-blur p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="size-4 text-amber" />
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  {isGastos ? "Detalle de Gastos" : "Anomalías Detectadas"}
                </div>
              </div>
              <div className="space-y-3 flex-1">
                {isGastos ? (
                  <>
                    <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3">
                      <div className="text-[9px] font-mono font-bold mb-1 text-cyan">
                        {activeLocal === "ALL" ? "BASE COMPLETA" : activeLocal} · {gastosCount} ÍTEMS CARGADOS
                      </div>
                      <div className="text-xs text-foreground/80">
                        Se guardó fecha de pago, local, concepto, imputación y monto de cada gasto.
                      </div>
                    </div>
                    {gastosDetalle.map((g, i) => (
                      <div key={`${g.local}-${g.concepto}-${g.fechaPago}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[9px] font-mono font-bold text-cyan uppercase tracking-wider">
                              {fmtDate(g.fechaPago)} · {g.local}
                            </div>
                            <div className="mt-1 text-xs text-foreground/90 truncate" title={g.concepto}>
                              {g.concepto}
                            </div>
                            <div className="mt-1 text-[10px] font-mono text-muted-foreground uppercase">
                              {g.grupo}
                            </div>
                          </div>
                          <div className="font-mono text-sm font-bold text-lime tabular-nums shrink-0">
                            {fmtMoney(g.monto)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
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
                  </>
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
