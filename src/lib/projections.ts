// Proyecciones (estimación de ventas y gastos por local/categoría/mes) y
// alertas de estimación vs. real, para controlar desvíos de gasto.

import { PCT_LOCALS } from "./pctConfig";

export type Proyeccion = {
  id: string;
  local: string; // uno de PROYECCION_LOCALS
  concepto: string; // concepto exacto del esqueleto MATRIX
  mes: string; // YYYY-MM
  monto: number;
  creadoEn: string;
};

const STORAGE_KEY = "matrix:v1:proyecciones";

export const PROYECCION_LOCALS: readonly string[] = PCT_LOCALS;

// Conceptos de ingreso: una alerta se dispara cuando el REAL queda por
// DEBAJO de lo proyectado. Para el resto (costos/gastos) se dispara cuando
// el REAL supera lo proyectado.
const CONCEPTOS_INGRESO = new Set([
  "TOTAL VENTA BRUTA",
  "TOTAL VENTA NETA",
  "TOTAL INGRESOS",
  "VENTA F",
  "VENTA NF",
  "OTROS INGRESOS",
]);
export const esConceptoIngreso = (concepto: string) => CONCEPTOS_INGRESO.has(concepto);

const genId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export function loadProyecciones(): Proyeccion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Proyeccion[]) : [];
  } catch (e) {
    console.warn("proyecciones load failed", e);
    return [];
  }
}

function saveProyecciones(list: Proyeccion[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("proyecciones save failed", e);
  }
}

// Crea o actualiza (si ya existe local+concepto+mes) una proyección.
export function upsertProyeccion(input: Omit<Proyeccion, "id" | "creadoEn">): Proyeccion[] {
  const list = loadProyecciones();
  const i = list.findIndex((p) => p.local === input.local && p.concepto === input.concepto && p.mes === input.mes);
  if (i >= 0) {
    list[i] = { ...list[i], monto: input.monto };
  } else {
    list.push({ ...input, id: genId(), creadoEn: new Date().toISOString() });
  }
  saveProyecciones(list);
  return list;
}

export function removeProyeccion(id: string): Proyeccion[] {
  const list = loadProyecciones().filter((p) => p.id !== id);
  saveProyecciones(list);
  return list;
}

export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const last = new Date(y, m, 0).getDate();
  return [first, `${ym}-${String(last).padStart(2, "0")}`];
}
