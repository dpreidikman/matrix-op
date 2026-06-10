// Parser MATRIX .xlsx → JSON limpio para el dashboard.
// Versión simplificada y resiliente: detecta filas/columnas relevantes
// por nombre y devuelve la forma { periodo, locales, kpis, pyl, detalle }.
//
// Si tenés el matrixParser.js completo que pasaste antes, podés reemplazar
// el contenido de este archivo manteniendo la firma `parseMatrix(file)`.

import * as XLSX from "xlsx";

export type Periodo = { mes: string; anio: number | string };
export type LocalKey = string;

export type KPI = {
  label: string;
  value: number;
  pct?: number;
  delta?: number; // vs proyección
};

export type PyLRow = {
  concepto: string;
  grupo?: string;
  porLocal: Record<LocalKey, number>;
  total: number;
  esSubtotal?: boolean;
};

export type DetalleRow = {
  categoria: string;
  local: LocalKey;
  proyectado: number;
  real: number;
  variacion: number;
};

export type MatrixData = {
  periodo: Periodo;
  locales: LocalKey[];
  kpis: KPI[];
  pyl: PyLRow[];
  detalle: DetalleRow[];
};

const num = (v: unknown): number => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,.\s]/g, (m) => (m === "," ? "." : "")));
    return isFinite(n) ? n : 0;
  }
  return 0;
};

const normalize = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export async function parseMatrix(file: File): Promise<MatrixData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Heurística: tomamos la primera hoja que parezca "RESUMEN" o la primera.
  const sheetName =
    wb.SheetNames.find((n) => /resumen|matrix|pl/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  // Encontrar fila de cabecera con nombres de locales.
  let headerIdx = rows.findIndex((r) =>
    (r ?? []).some((c) => /local|sucursal|tienda/i.test(String(c ?? "")))
  );
  if (headerIdx < 0) headerIdx = 0;

  const header = rows[headerIdx] ?? [];
  const locales: LocalKey[] = [];
  const localCols: number[] = [];
  header.forEach((c, i) => {
    const v = String(c ?? "").trim();
    if (i > 0 && v && !/total|concepto|grupo/i.test(v)) {
      locales.push(v);
      localCols.push(i);
    }
  });

  const pyl: PyLRow[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const concepto = String(row[0] ?? "").trim();
    if (!concepto) continue;
    const porLocal: Record<string, number> = {};
    let total = 0;
    localCols.forEach((ci, k) => {
      const v = num(row[ci]);
      porLocal[locales[k]] = v;
      total += v;
    });
    pyl.push({
      concepto,
      porLocal,
      total,
      esSubtotal: /total|margen|utilidad|ebitda|bruto/i.test(concepto),
    });
  }

  // KPIs derivados
  const find = (re: RegExp) =>
    pyl.find((p) => re.test(normalize(p.concepto)))?.total ?? 0;

  const venta = find(/venta|ingreso|revenue/);
  const cmv = find(/cmv|costo.*mercader|food.*cost|alimento/);
  const laboral = find(/laboral|mano.*obra|labor|sueldo/);
  const margen = venta ? (venta - cmv - laboral) / venta : 0;

  const kpis: KPI[] = [
    { label: "Venta Neta", value: venta },
    { label: "CMV", value: cmv, pct: venta ? cmv / venta : 0 },
    { label: "Costo Laboral", value: laboral, pct: venta ? laboral / venta : 0 },
    { label: "Margen Operativo", value: venta - cmv - laboral, pct: margen },
  ];

  // Detalle: si hay hoja DETALLE con columnas proyectado/real
  const detalle: DetalleRow[] = [];
  const detSheetName = wb.SheetNames.find((n) => /detalle|detail/i.test(n));
  if (detSheetName) {
    const det: any[] = XLSX.utils.sheet_to_json(wb.Sheets[detSheetName], {
      defval: null,
    });
    for (const d of det) {
      const cat = d.categoria ?? d.concepto ?? d.Concepto ?? d.Categoria;
      const loc = d.local ?? d.Local ?? d.sucursal ?? "—";
      if (!cat) continue;
      const p = num(d.proyectado ?? d.Proyectado ?? d.proj ?? 0);
      const re = num(d.real ?? d.Real ?? 0);
      detalle.push({
        categoria: String(cat),
        local: String(loc),
        proyectado: p,
        real: re,
        variacion: p ? (re - p) / p : 0,
      });
    }
  } else {
    // Sin hoja detalle: derivar de pyl no-subtotal × locales como "real",
    // con proyección estimada en -5% (placeholder visual).
    pyl
      .filter((p) => !p.esSubtotal)
      .slice(0, 8)
      .forEach((p) => {
        for (const loc of locales) {
          const real = p.porLocal[loc];
          const proj = real * 0.95;
          detalle.push({
            categoria: p.concepto,
            local: loc,
            proyectado: proj,
            real,
            variacion: proj ? (real - proj) / proj : 0,
          });
        }
      });
  }

  const periodo: Periodo = { mes: sheetName, anio: new Date().getFullYear() };

  return { periodo, locales, kpis, pyl, detalle };
}

// Demo data para mostrar el dashboard sin archivo cargado
export const demoData: MatrixData = {
  periodo: { mes: "OCT", anio: 2025 },
  locales: ["Palermo", "Recoleta", "Belgrano", "Puerto Madero", "Caballito", "Núñez", "Villa Crespo", "San Telmo", "Colegiales"],
  kpis: [
    { label: "Venta Neta", value: 2_613_390, delta: 0.042 },
    { label: "CMV", value: 821_400, pct: 0.314, delta: 0.021 },
    { label: "Costo Laboral", value: 648_200, pct: 0.248, delta: -0.008 },
    { label: "Margen Operativo", value: 475_700, pct: 0.182, delta: 0.011 },
  ],
  pyl: [
    { concepto: "Venta Neta", porLocal: { Palermo: 412000, Recoleta: 285000, Belgrano: 198000, "Puerto Madero": 353390, Caballito: 221_000, "Núñez": 264_000, "Villa Crespo": 189_000, "San Telmo": 312_000, Colegiales: 379_000 }, total: 2_613_390 },
    { concepto: "CMV", porLocal: { Palermo: 133000, Recoleta: 108_500, Belgrano: 57_800, "Puerto Madero": 92_700, Caballito: 70_200, "Núñez": 81_300, "Villa Crespo": 62_400, "San Telmo": 98_100, Colegiales: 117_400 }, total: 821_400 },
    { concepto: "Utilidad Bruta", porLocal: { Palermo: 279000, Recoleta: 176_500, Belgrano: 140_200, "Puerto Madero": 260_690, Caballito: 150_800, "Núñez": 182_700, "Villa Crespo": 126_600, "San Telmo": 213_900, Colegiales: 261_600 }, total: 1_791_990, esSubtotal: true },
    { concepto: "Costo Laboral", porLocal: { Palermo: 91_000, Recoleta: 80_900, Belgrano: 48_500, "Puerto Madero": 89_200, Caballito: 56_300, "Núñez": 67_100, "Villa Crespo": 52_800, "San Telmo": 78_200, Colegiales: 84_200 }, total: 648_200 },
    { concepto: "Servicios", porLocal: { Palermo: 18_000, Recoleta: 14_200, Belgrano: 9_800, "Puerto Madero": 16_400, Caballito: 10_500, "Núñez": 12_600, "Villa Crespo": 9_100, "San Telmo": 15_200, Colegiales: 17_800 }, total: 123_600 },
    { concepto: "Alquiler", porLocal: { Palermo: 42_000, Recoleta: 28_500, Belgrano: 19_800, "Puerto Madero": 35_300, Caballito: 22_400, "Núñez": 26_700, "Villa Crespo": 18_900, "San Telmo": 31_200, Colegiales: 37_400 }, total: 262_200 },
    { concepto: "Margen Operativo", porLocal: { Palermo: 128_000, Recoleta: 52_900, Belgrano: 62_100, "Puerto Madero": 119_790, Caballito: 61_600, "Núñez": 76_300, "Villa Crespo": 45_800, "San Telmo": 89_300, Colegiales: 122_200 }, total: 757_990, esSubtotal: true },
  ],
  detalle: [
    { categoria: "Proteínas", local: "Palermo", proyectado: 42_000, real: 48_300, variacion: 0.15 },
    { categoria: "Vegetales", local: "Palermo", proyectado: 12_000, real: 11_500, variacion: -0.041 },
    { categoria: "Bebidas", local: "Palermo", proyectado: 22_000, real: 23_100, variacion: 0.05 },
    { categoria: "Lácteos", local: "Palermo", proyectado: 8_000, real: 8_400, variacion: 0.05 },
    { categoria: "Panadería", local: "Palermo", proyectado: 6_000, real: 5_400, variacion: -0.10 },
    { categoria: "Proteínas", local: "Recoleta", proyectado: 35_000, real: 38_200, variacion: 0.091 },
    { categoria: "Vegetales", local: "Recoleta", proyectado: 10_500, real: 9_900, variacion: -0.057 },
    { categoria: "Bebidas", local: "Recoleta", proyectado: 18_000, real: 19_800, variacion: 0.10 },
  ],
};