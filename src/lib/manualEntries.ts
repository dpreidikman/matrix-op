// Carga manual de datos para categorías que no vienen desglosadas en ningún
// archivo (Otros Ingresos, CMV, Costo Laboral, Honorarios, Regalías,
// Comisiones TC y Gastos Bancarios, Impuestos, Total Alquiler y Expensas,
// Total Servicios, Estructura NG). Se guardan en el navegador y se integran
// a la Matrix como si fueran un gasto más (ver manualEntriesToGastos).

import { PCT_LOCALS } from "./pctConfig";
import type { GastoRow } from "./matrixParser";

export type Granularidad = "dia" | "semana" | "mes" | "anio";

export type ManualEntry = {
  id: string;
  local: string;
  concepto: string; // concepto EXACTO del esqueleto MATRIX (ver MANUAL_CONCEPTOS)
  monto: number;
  fecha: string; // ISO yyyy-mm-dd — fecha ancla del período cargado (primer día)
  granularidad: Granularidad;
  nota?: string;
  creadoEn: string;
};

const STORAGE_KEY = "matrix:v1:manualEntries";

// Categorías habilitadas para carga manual → concepto exacto del esqueleto.
export const MANUAL_CONCEPTOS: Array<{ label: string; concepto: string }> = [
  { label: "Otros Ingresos", concepto: "OTROS INGRESOS" },
  { label: "CMV", concepto: "CMV" },
  { label: "Costo Laboral", concepto: "COSTO LABORAL" },
  { label: "Honorarios", concepto: "HONORARIOS" },
  { label: "Regalías", concepto: "REGALIAS" },
  { label: "Comisiones TC y Gastos Bancarios", concepto: "COMISIONES TC Y GASTOS BANCARIOS" },
  { label: "Impuestos", concepto: "IMPUESTOS" },
  { label: "Total Alquiler y Expensas", concepto: "TOTAL ALQUILER Y EXPENSAS" },
  { label: "Total Servicios", concepto: "TOTAL SERVICIOS PUBLICOS" },
  { label: "Estructura NG", concepto: "ESTRUCTURA NG" },
];

export const MANUAL_LOCALS: readonly string[] = PCT_LOCALS;

export const GRANULARIDAD_LABEL: Record<Granularidad, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
};

const genId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export function loadManualEntries(): ManualEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ManualEntry[]) : [];
  } catch (e) {
    console.warn("manual entries load failed", e);
    return [];
  }
}

function saveManualEntries(entries: ManualEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn("manual entries save failed", e);
  }
}

export function addManualEntry(input: Omit<ManualEntry, "id" | "creadoEn">): ManualEntry[] {
  const entries = [...loadManualEntries(), { ...input, id: genId(), creadoEn: new Date().toISOString() }];
  saveManualEntries(entries);
  return entries;
}

export function removeManualEntry(id: string): ManualEntry[] {
  const entries = loadManualEntries().filter((e) => e.id !== id);
  saveManualEntries(entries);
  return entries;
}

// Convierte entradas manuales a filas tipo "gasto" para integrarlas al mismo
// motor de agregación (buildPyl) que usa el resto de la Matrix.
export function manualEntriesToGastos(entries: ManualEntry[]): GastoRow[] {
  return entries.map((e) => ({
    id: `manual-${e.id}`,
    local: e.local,
    fechaPago: e.fecha,
    concepto: MANUAL_CONCEPTOS.find((c) => c.concepto === e.concepto)?.label ?? e.concepto,
    imputacion: `Carga manual · ${GRANULARIDAD_LABEL[e.granularidad]}`,
    grupo: e.concepto,
    monto: e.monto,
  }));
}
