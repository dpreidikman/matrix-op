// Configuración de porcentajes Venta F / Venta NF por local y por mes.
// Se persiste en localStorage. Los valores son porcentajes (ej: 62.92 = 62.92%).

export type PctEntry = { f: number; nf: number };
export type PctConfig = Record<string, Record<string, PctEntry>>; // local -> ym -> {f,nf}

export const PCT_STORAGE_KEY = "matrix:v1:pct";

// Locales configurables (los que se alimentan de Vinson y aplican fórmulas).
export const PCT_LOCALS = ["LA MALA", "COMEDOR"] as const;

// Defaults históricos: F = 52% * 1.21 = 62.92 ; NF = 48%.
export const DEFAULT_PCT: PctEntry = { f: 52 * 1.21, nf: 48 };

export const PCT_MONTHS_2026 = Array.from({ length: 12 }, (_, i) =>
  `2026-${String(i + 1).padStart(2, "0")}`,
);

export function loadPctConfig(): PctConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PCT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PctConfig) : {};
  } catch {
    return {};
  }
}

export function savePctConfig(cfg: PctConfig) {
  try {
    localStorage.setItem(PCT_STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

// Busca el % efectivo para un local + período (usa el mes de `periodFrom`).
// Si no hay match exacto por nombre, intenta match case-insensitive.
export function getPct(cfg: PctConfig, local: string, ym: string): PctEntry {
  if (!ym) return DEFAULT_PCT;
  const keys = Object.keys(cfg);
  const key = keys.find((k) => k.toLowerCase() === local.toLowerCase());
  const entry = key ? cfg[key]?.[ym] : undefined;
  return entry ?? DEFAULT_PCT;
}