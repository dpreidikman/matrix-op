import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { mergeMatrixData, type MatrixData } from "@/lib/matrixParser";
import { loadPctConfig } from "@/lib/pctConfig";
import { getVinsonHistory, VINSON_STORES } from "@/lib/vinson.functions";

export const Route = createFileRoute("/agente")({
  head: () => ({
    meta: [
      { title: "MATRIX // Agente" },
      {
        name: "description",
        content: "Consultá facturación, gastos y desvíos por local en lenguaje natural.",
      },
      { property: "og:title", content: "MATRIX // Agente" },
      {
        property: "og:description",
        content: "Consultá facturación, gastos y desvíos por local en lenguaje natural.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentePage,
});

const navLink = (active: boolean) =>
  `text-left px-3 py-2.5 rounded-md text-sm font-medium border ${
    active
      ? "bg-cyan/10 border-cyan/30 text-cyan"
      : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
  }`;

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

function loadMatrix(): MatrixData | null {
  if (typeof window === "undefined") return null;
  try {
    const m = localStorage.getItem("matrix:v1:auto");
    const g = localStorage.getItem("matrix:v1:detallado");
    const a = m ? (JSON.parse(m) as MatrixData) : null;
    const b = g ? (JSON.parse(g) as MatrixData) : null;
    if (a && b) return mergeMatrixData(a, b);
    return a ?? b;
  } catch {
    return null;
  }
}

function buildContext(
  data: MatrixData | null,
  vinson: { store: string; rows: { date: string; total: number }[] }[],
): string {
  const out: string[] = [];

  out.push("## VENTAS (fuente Vinson, por mes)");
  if (!vinson.length) out.push("(sin datos)");
  for (const v of vinson) {
    const byMonth = new Map<string, number>();
    for (const r of v.rows) {
      const ym = r.date.slice(0, 7);
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + r.total);
    }
    const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (!months.length) continue;
    out.push(
      `- ${v.store}: ` +
        months.map(([ym, t]) => `${ym}=${money(t)}`).join(", ") +
        ` | TOTAL=${money(months.reduce((a, [, t]) => a + t, 0))}`,
    );
  }

  if (!data) {
    out.push("\n## P&L / GASTOS\n(no hay documentos cargados en la sección Documentos)");
    return out.join("\n");
  }

  out.push(
    `\n## PERIODO MATRIX: ${data.periodo?.mes ?? "?"} ${data.periodo?.anio ?? ""}`,
  );
  out.push(`Locales: ${data.locales.join(", ")}`);

  out.push("\n## P&L POR CONCEPTO Y LOCAL (valores reales)");
  for (const r of data.pyl) {
    const parts = Object.entries(r.porLocal)
      .filter(([, v]) => Math.abs(Number(v) || 0) > 0.5)
      .map(([loc, v]) => `${loc}=${money(Number(v))}`);
    if (!parts.length) continue;
    out.push(`- ${r.concepto}: ${parts.join(", ")} | TOTAL=${money(r.total ?? 0)}`);
  }

  const gastos = data.gastos ?? [];
  if (gastos.length) {
    out.push("\n## GASTOS DETALLADOS AGREGADOS (local | mes | grupo | imputación = monto)");
    const agg = new Map<string, number>();
    for (const g of gastos) {
      const ym = (g.fechaPago || g.fecha || "").slice(0, 7);
      const k = `${g.local} | ${ym} | ${g.grupo} | ${g.imputacion}`;
      agg.set(k, (agg.get(k) ?? 0) + (Number(g.monto) || 0));
    }
    const rows = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400);
    for (const [k, v] of rows) out.push(`- ${k} = ${money(v)}`);

    out.push("\n## TOP 40 GASTOS INDIVIDUALES");
    const top = [...gastos].sort((a, b) => (b.monto || 0) - (a.monto || 0)).slice(0, 40);
    for (const g of top) {
      out.push(
        `- ${g.fechaPago || g.fecha || "s/f"} | ${g.local} | ${g.imputacion} | ${g.concepto} = ${money(Number(g.monto) || 0)}`,
      );
    }
  }

  const pct = loadPctConfig();
  if (Object.keys(pct).length) {
    out.push("\n## CONFIGURACIÓN % VENTA F / NF (por local y mes)");
    for (const [loc, months] of Object.entries(pct)) {
      const s = Object.entries(months)
        .map(([ym, p]) => `${ym}: F=${p.f}% NF=${p.nf}%`)
        .join(", ");
      if (s) out.push(`- ${loc}: ${s}`);
    }
  }

  return out.join("\n");
}

const SUGGESTIONS = [
  "¿Cuánto facturó La Mala en mayo?",
  "¿Cuál fue el gasto más elevado del período?",
  "¿Qué gastos estuvieron por encima de lo normal?",
  "Comparame la facturación de Kona vs Costa Resto",
];

function AgentePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [context, setContext] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = loadMatrix();
      const vinson: { store: string; rows: { date: string; total: number }[] }[] = [];
      for (const s of VINSON_STORES) {
        try {
          const res = await getVinsonHistory({ data: { storeId: s.id } });
          vinson.push({ store: s.name, rows: res.rows });
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      setContext(buildContext(data, vinson));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ context }),
      }),
    [context],
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport,
    onError: (e) => toast.error(e.message || "No se pudo consultar al agente"),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || !ready) return;
    setInput("");
    void sendMessage({ text: t });
  };

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg">
      <div className="flex">
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md border border-border bg-card"
        >
          <Menu className="size-5" />
        </button>

        <aside
          className={`fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 border-r border-border bg-card/60 backdrop-blur p-4 flex flex-col gap-4 transition-transform ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-[Orbitron] text-2xl font-black tracking-widest text-cyan">
                MATRIX
              </div>
              <div className="mt-1 text-xl font-bold tracking-tight">Agente</div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 px-2">
              Módulos
            </div>
            <Link to="/" className={navLink(false)}>MATRIX</Link>
            <Link to="/documentos" className={navLink(false)}>Documentos</Link>
            <Link to="/vinson" className={navLink(false)}>Ventas</Link>
            <Link to="/percentages" className={navLink(false)}>Configuraciones</Link>
            <Link to="/agente" className={navLink(true)}>Agente</Link>
          </nav>
        </aside>

        <main className="flex-1 min-w-0 w-full p-6 lg:p-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agente</h1>
              <p className="text-sm text-muted-foreground">
                Preguntá por facturación, gastos o desvíos. Responde solo con los datos cargados.
              </p>
            </div>
            <button
              onClick={() => setMessages([])}
              className="text-xs font-mono uppercase tracking-widest px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
            >
              <RotateCcw className="size-3.5" /> Limpiar
            </button>
          </div>

          <div className="rounded-lg border border-border bg-card/50 flex flex-col h-[calc(100vh-14rem)] min-h-[420px]">
            <Conversation>
              <ConversationContent>
                {messages.length === 0 ? (
                  <ConversationEmptyState
                    title={ready ? "Preguntale al Agente" : "Cargando datos..."}
                    description="Analiza ventas de Vinson, el P&L y los gastos cargados en Documentos."
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="font-[Orbitron] text-3xl font-black tracking-widest text-cyan">
                        MATRIX
                      </div>
                      <div className="text-sm text-muted-foreground max-w-md">
                        {ready
                          ? "Analiza ventas de Vinson, el P&L y los gastos cargados en Documentos."
                          : "Cargando datos de ventas y gastos..."}
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={() => send(s)}
                            className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-cyan/40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </ConversationEmptyState>
                ) : (
                  messages.map((m) => {
                    const text = m.parts
                      .map((p) => (p.type === "text" ? p.text : ""))
                      .join("");
                    return (
                      <Message from={m.role} key={m.id}>
                        <MessageContent
                          className={
                            m.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent"
                          }
                        >
                          <MessageResponse>{text}</MessageResponse>
                        </MessageContent>
                      </Message>
                    );
                  })
                )}
                {status === "submitted" && (
                  <Shimmer className="text-sm">Analizando datos...</Shimmer>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="p-3 border-t border-border">
              <PromptInput
                onSubmit={(_m, e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <PromptInputTextarea
                  ref={textareaRef}
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ej: ¿cuánto facturó Comedor en marzo?"
                />
                <PromptInputFooter className="justify-end">
                  <PromptInputSubmit
                    status={status}
                    disabled={!ready || (!input.trim() && !busy)}
                    onStop={stop}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}