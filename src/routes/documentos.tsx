import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, X, Upload, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  parseMatrix,
  parseGastosDetallados,
  mergeMatrixData,
  type MatrixData,
} from "@/lib/matrixParser";

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: "MATRIX // Documentos" },
      { name: "description", content: "Carga de documentos A y B y análisis de gastos identificados." },
      { property: "og:title", content: "MATRIX // Documentos" },
      { property: "og:description", content: "Carga documentos por categoría y analizá los gastos detectados." },
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

function Documentos() {
  const [meta, setMeta] = useState<MetaMap>({});
  const [dataA, setDataA] = useState<MatrixData | null>(null);
  const [dataB, setDataB] = useState<MatrixData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const refA = useRef<HTMLInputElement>(null);
  const refB = useRef<HTMLInputElement>(null);

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

  const handle = async (f: File | null | undefined, slot: "A" | "B") => {
    if (!f) return;
    try {
      const parsed = slot === "B" ? await parseGastosDetallados(f) : await parseMatrix(f);
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
      toast.success(`Documento ${slot} cargado · ${parsed.locales.length} locales`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo parsear el archivo");
    }
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
    return {
      total,
      count: gastos.length,
      locales: combined.locales,
      desde: dates[0] ?? "",
      hasta: dates[dates.length - 1] ?? "",
      grupos: [...byGrupo.entries()].sort((a, b) => b[1] - a[1]),
      imputaciones: [...byImput.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    };
  }, [dataA, dataB]);

  const Card = ({ slot, title, desc }: { slot: "A" | "B"; title: string; desc: string }) => {
    const m = meta[slot];
    const inputRef = slot === "A" ? refA : refB;
    return (
      <section className="rounded-xl border border-white/10 bg-panel/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-cyan" />
              <h2 className="font-mono uppercase tracking-wider text-sm">{title}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { void handle(e.target.files?.[0], slot); e.currentTarget.value = ""; }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md border border-cyan/40 bg-cyan/5 px-3 py-2 font-mono text-xs text-cyan hover:bg-cyan/15"
            >
              <Upload className="size-3.5" /> Cargar
            </button>
            {m && (
              <button
                onClick={() => remove(slot)}
                className="inline-flex items-center gap-2 rounded-md border border-white/10 px-2 py-2 text-muted-foreground hover:text-foreground"
                title="Eliminar"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-background/40 px-4 py-3 font-mono text-xs">
          {m ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-foreground">{m.name}</span>
              <span className="text-muted-foreground">{m.rows} filas</span>
              <span className="text-muted-foreground">{m.locales} locales</span>
              <span className="text-muted-foreground">
                {new Date(m.at).toLocaleString("es-AR")}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">Sin documento cargado</span>
          )}
        </div>
      </section>
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
                Cargá los archivos por categoría. Se analizan en conjunto y alimentan la Matrix.
              </p>
            </div>
          </div>

          <Card slot="A" title="Documento A" desc="MATRIX / gastos semanales (.xlsx)" />
          <Card slot="B" title="Documento B" desc="Base de gastos detallados con Fecha Servicio + Categoría (.xlsx)" />

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
        </main>
      </div>
      <Toaster />
    </div>
  );
}
