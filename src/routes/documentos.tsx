import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Menu, X, Upload, FileSpreadsheet, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  parseMatrix,
  parseGastosDetallados,
  mergeMatrixData,
  reclassifyGastos,
  listaConceptosCategorizables,
  MATRIX_SKELETON,
  type MatrixData,
} from "@/lib/matrixParser";
import { setCategoryOverride } from "@/lib/categoryOverrides";

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: "MATRIX // Documentos" },
      { name: "description", content: "Carga de planillas y análisis de gastos identificados." },
      { property: "og:title", content: "MATRIX // Documentos" },
      { property: "og:description", content: "Cargá tus planillas y analizá los gastos detectados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Documentos,
});

const KEYS = {
  A: "matrix:v1:auto",
  B: "matrix:v1:detallado",
  name: "matrix:v1:filename",
  meta: "matrix:v1:docs",
} as const;

type DocMeta = { name: string; at: string; rows: number; locales: number };
type MetaMap = Partial<Record<"A" | "B", DocMeta>>;

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

function navLink(active: boolean) {
  return active
    ? "text-left px-3 py-2.5 rounded-md text-sm font-medium border bg-cyan/10 border-cyan/30 text-cyan"
    : "text-left px-3 py-2.5 rounded-md text-sm font-medium border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground";
}

// Detecta automáticamente qué tipo de planilla es (resumen MATRIX o gastos
// detallados con Categoría/Sub-categoría) para que el usuario no tenga que
// elegir un "slot" a mano: sube el archivo y el sistema lo clasifica solo.
async function detectAndParse(f: File): Promise<{ slot: "A" | "B"; parsed: MatrixData }> {
  try {
    const parsed = await parseGastosDetallados(f);
    return { slot: "B", parsed };
  } catch {
    const parsed = await parseMatrix(f);
    return { slot: "A", parsed };
  }
}

const SLOT_LABEL: Record<"A" | "B", string> = {
  A: "Resumen MATRIX",
  B: "Gastos detallados (Categoría/Sub-categoría)",
};

function Documentos() {
  const [meta, setMeta] = useState<MetaMap>({});
  const [dataA, setDataA] = useState<MatrixData | null>(null);
  const [dataB, setDataB] = useState<MatrixData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const m = localStorage.getItem(KEYS.meta);
      if (m) setMeta(JSON.parse(m));
      const a = localStorage.getItem(KEYS.A);
      const b = localStorage.getItem(KEYS.B);
      if (a) setDataA(JSON.parse(a));
      if (b) setDataB(JSON.parse(b));
    } catch (e) {
      console.warn("docs load failed", e);
    }
  }, []);

  const saveMeta = (next: MetaMap) => {
    setMeta(next);
    try { localStorage.setItem(KEYS.meta, JSON.stringify(next)); } catch {}
  };

  const handle = async (f: File | null | undefined) => {
    if (!f) return;
    setLoading(true);
    try {
      const { slot, parsed } = await detectAndParse(f);
      localStorage.setItem(KEYS[slot], JSON.stringify(parsed));
      localStorage.setItem(KEYS.name, f.name);
      if (slot === "A") setDataA(parsed); else setDataB(parsed);
      saveMeta({
        ...meta,
        [slot]: {
          name: f.name,
          at: new Date().toISOString(),
          rows: parsed.gastos?.length ?? parsed.pyl.length,
          locales: parsed.locales.length,
        },
      });
      toast.success(`${SLOT_LABEL[slot]} cargado · ${parsed.locales.length} locales`);
    } catch (e) {
      console.error(e);
      toast.error("No pudimos identificar este archivo. Revisá que tenga las columnas esperadas (Local, Concepto/Categoría, Monto).");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void handle(e.dataTransfer.files?.[0]);
  };

  const remove = (slot: "A" | "B") => {
    localStorage.removeItem(KEYS[slot]);
    if (slot === "A") setDataA(null); else setDataB(null);
    const next = { ...meta };
    delete next[slot];
    saveMeta(next);
    toast.success(`Documento ${slot} eliminado`);
  };

  // Análisis conjunto de todos los documentos cargados
  const analysis = useMemo(() => {
    const combined: MatrixData | null =
      dataA && dataB ? mergeMatrixData(dataA, dataB) : (dataB ?? dataA);
    if (!combined) return null;
    const gastos = combined.gastos ?? [];
    const byGrupo = new Map<string, number>();
    const byImput = new Map<string, number>();
    for (const g of gastos) {
      byGrupo.set(g.grupo || "SIN GRUPO", (byGrupo.get(g.grupo || "SIN GRUPO") ?? 0) + g.monto);
      byImput.set(g.imputacion || "SIN IMPUTACIÓN", (byImput.get(g.imputacion || "SIN IMPUTACIÓN") ?? 0) + g.monto);
    }
    const total = gastos.reduce((s, g) => s + g.monto, 0);
    const dates = gastos.map((g) => g.fechaPago).filter(Boolean).sort();

    // Buckets "SIN CATEGORIA": agrupados por la Categoria original del archivo
    // (imputacion), para poder asignarles un concepto real desde la UI.
    const skeleton = combined.skeleton ?? MATRIX_SKELETON;
    const sinCatBuckets = new Set(skeleton.filter((it) => it.parent === "SIN CATEGORIA").map((it) => it.concepto));
    const byCategoriaOriginal = new Map<string, { grupo: string; total: number; count: number }>();
    for (const g of gastos) {
      if (!sinCatBuckets.has(g.grupo)) continue;
      const key = g.imputacion || "SIN DATO";
      const acc = byCategoriaOriginal.get(key) ?? { grupo: g.grupo, total: 0, count: 0 };
      acc.total += g.monto;
      acc.count += 1;
      byCategoriaOriginal.set(key, acc);
    }
    const sinCategoria = [...byCategoriaOriginal.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.total - a.total);

    return {
      total,
      count: gastos.length,
      locales: combined.locales,
      desde: dates[0] ?? "",
      hasta: dates[dates.length - 1] ?? "",
      grupos: [...byGrupo.entries()].sort((a, b) => b[1] - a[1]),
      imputaciones: [...byImput.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
      sinCategoria,
    };
  }, [dataA, dataB]);

  const categoriasDisponibles = useMemo(() => {
    const items = listaConceptosCategorizables();
    const byParent = new Map<string, string[]>();
    for (const it of items) {
      if (!byParent.has(it.parent)) byParent.set(it.parent, []);
      byParent.get(it.parent)!.push(it.concepto);
    }
    return [...byParent.entries()];
  }, []);

  const categorizar = (categoriaOriginal: string, concepto: string) => {
    if (!concepto || !dataB) return;
    setCategoryOverride(categoriaOriginal, concepto);
    const next = reclassifyGastos(dataB);
    localStorage.setItem(KEYS.B, JSON.stringify(next));
    setDataB(next);
    toast.success(`"${categoriaOriginal}" → ${concepto}`);
  };

  const StatusRow = ({ slot, title }: { slot: "A" | "B"; title: string }) => {
    const m = meta[slot];
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-background/40 px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2 min-w-[11rem]">
          <FileSpreadsheet className={`size-3.5 ${m ? "text-cyan" : "text-muted-foreground"}`} />
          <span className={m ? "text-foreground" : "text-muted-foreground"}>{title}</span>
        </div>
        {m ? (
          <>
            <span className="text-foreground">{m.name}</span>
            <span className="text-muted-foreground">{m.rows} filas</span>
            <span className="text-muted-foreground">{m.locales} locales</span>
            <span className="text-muted-foreground">{new Date(m.at).toLocaleString("es-AR")}</span>
            <button
              onClick={() => remove(slot)}
              className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              title="Eliminar"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : (
          <span className="text-muted-foreground">Sin cargar todavía</span>
        )}
      </div>
    );
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
              <div className="mt-1 text-xl font-bold tracking-tight">Documentos</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 px-2">Módulos</div>
            <Link to="/" className={navLink(false)}>MATRIX</Link>
            <Link to="/documentos" className={navLink(true)}>Documentos</Link>
            <Link to="/vinson" className={navLink(false)}>Ventas</Link>
            <Link to="/percentages" className={navLink(false)}>Configuraciones</Link>
            <Link to="/agente" className={navLink(false)}>Agente</Link>
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="size-5" />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-cyan">Carga</div>
              <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Arrastrá tu planilla o hacé clic para elegirla. El sistema detecta sola si es el resumen
                MATRIX o la base de gastos detallados, y alimenta la Matrix automáticamente.
              </p>
            </div>
          </div>

          <section
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-cyan bg-cyan/5" : "border-white/15 bg-panel/40 hover:border-white/30"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { void handle(e.target.files?.[0]); e.currentTarget.value = ""; }}
            />
            <Upload className={`mx-auto size-6 ${dragOver ? "text-cyan" : "text-muted-foreground"}`} />
            <p className="mt-3 text-sm font-medium">
              {loading ? "Procesando archivo…" : "Arrastrá tu planilla acá o hacé clic para elegirla"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">.xlsx, .xls o .csv</p>
          </section>

          <div className="space-y-2">
            <StatusRow slot="A" title={SLOT_LABEL.A} />
            <StatusRow slot="B" title={SLOT_LABEL.B} />
          </div>

          <section className="rounded-xl border border-white/10 bg-panel/40 overflow-hidden">
            <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-mono uppercase tracking-wider text-sm">Gastos identificados</h2>
              {analysis && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {analysis.count} ítems · {analysis.desde || "—"} → {analysis.hasta || "—"}
                </span>
              )}
            </header>
            {!analysis || analysis.count === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Cargá al menos un documento con gastos para ver el análisis.
              </p>
            ) : (
              <div className="grid gap-6 p-5 lg:grid-cols-2">
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Por grupo · total {fmtMoney(analysis.total)}
                  </div>
                  <table className="w-full text-sm font-mono">
                    <tbody>
                      {analysis.grupos.map(([g, v]) => (
                        <tr key={g} className="border-b border-white/5">
                          <td className="py-1.5 pr-4">{g}</td>
                          <td className="py-1.5 text-right">{fmtMoney(v)}</td>
                          <td className="py-1.5 pl-4 text-right text-muted-foreground text-xs">
                            {analysis.total ? ((v / analysis.total) * 100).toFixed(1) + "%" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Top imputaciones
                  </div>
                  <table className="w-full text-sm font-mono">
                    <tbody>
                      {analysis.imputaciones.map(([g, v]) => (
                        <tr key={g} className="border-b border-white/5">
                          <td className="py-1.5 pr-4">{g}</td>
                          <td className="py-1.5 text-right">{fmtMoney(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {analysis && analysis.sinCategoria.length > 0 && (
            <section className="rounded-xl border border-magenta/30 bg-panel/40 overflow-hidden">
              <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Tag className="size-4 text-magenta" />
                  <h2 className="font-mono uppercase tracking-wider text-sm">Sin categorizar</h2>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {analysis.sinCategoria.length} categoría(s) del archivo sin mapear
                </span>
              </header>
              <p className="px-5 pt-4 text-xs text-muted-foreground">
                Estas categorías vinieron sin sub-categoría en el documento de gastos detallados.
                Elegí a qué concepto de la Matrix pertenecen; se va a aplicar a todos los ítems con esa
                categoría (en este archivo y en los que subas después).
              </p>
              <div className="p-5 pt-3 space-y-2">
                {analysis.sinCategoria.map((row) => (
                  <div
                    key={row.categoria}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-background/40 px-4 py-3"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <div className="text-sm font-medium">{row.categoria}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {row.count} ítems · {fmtMoney(row.total)}
                      </div>
                    </div>
                    <select
                      defaultValue=""
                      onChange={(e) => categorizar(row.categoria, e.target.value)}
                      className="bg-background/70 border border-white/10 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan"
                    >
                      <option value="" disabled>
                        Elegir categoría…
                      </option>
                      {categoriasDisponibles.map(([parent, conceptos]) => (
                        <optgroup key={parent} label={parent}>
                          {conceptos.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
