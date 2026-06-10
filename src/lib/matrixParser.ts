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
  locales: [
    "LA MALA",
    "CRUZA POLO",
    "CRUZA RECOLETA",
    "MILVIDAS",
    "MILVIDAS DIARIO",
    "COSTA RESTO",
    "COSTA CLUB",
    "COMEDOR",
    "KONA",
    "COCHINCHINA",
  ],
  kpis: [
    { label: "Venta Neta", value: 2_613_390, delta: 0.042 },
    { label: "CMV", value: 821_400, pct: 0.314, delta: 0.021 },
    { label: "Costo Laboral", value: 648_200, pct: 0.248, delta: -0.008 },
    { label: "Margen Operativo", value: 475_700, pct: 0.182, delta: 0.011 },
  ],
  pyl: [
    { concepto: "Venta Neta", porLocal: { "LA MALA": 412000, "CRUZA POLO": 285000, "CRUZA RECOLETA": 198000, MILVIDAS: 353390, "MILVIDAS DIARIO": 142000, "COSTA RESTO": 264000, "COSTA CLUB": 189000, COMEDOR: 312000, KONA: 221000, COCHINCHINA: 237000 }, total: 2_613_390 },
    { concepto: "CMV", porLocal: { "LA MALA": 133000, "CRUZA POLO": 108_500, "CRUZA RECOLETA": 57_800, MILVIDAS: 92_700, "MILVIDAS DIARIO": 45_200, "COSTA RESTO": 81_300, "COSTA CLUB": 62_400, COMEDOR: 98_100, KONA: 70_200, COCHINCHINA: 72_200 }, total: 821_400 },
    { concepto: "Utilidad Bruta", porLocal: { "LA MALA": 279000, "CRUZA POLO": 176_500, "CRUZA RECOLETA": 140_200, MILVIDAS: 260_690, "MILVIDAS DIARIO": 96_800, "COSTA RESTO": 182_700, "COSTA CLUB": 126_600, COMEDOR: 213_900, KONA: 150_800, COCHINCHINA: 164_800 }, total: 1_791_990, esSubtotal: true },
    { concepto: "Costo Laboral", porLocal: { "LA MALA": 91_000, "CRUZA POLO": 80_900, "CRUZA RECOLETA": 48_500, MILVIDAS: 89_200, "MILVIDAS DIARIO": 36_400, "COSTA RESTO": 67_100, "COSTA CLUB": 52_800, COMEDOR: 78_200, KONA: 56_300, COCHINCHINA: 47_800 }, total: 648_200 },
    { concepto: "Servicios", porLocal: { "LA MALA": 18_000, "CRUZA POLO": 14_200, "CRUZA RECOLETA": 9_800, MILVIDAS: 16_400, "MILVIDAS DIARIO": 7_200, "COSTA RESTO": 12_600, "COSTA CLUB": 9_100, COMEDOR: 15_200, KONA: 10_500, COCHINCHINA: 10_600 }, total: 123_600 },
    { concepto: "Alquiler", porLocal: { "LA MALA": 42_000, "CRUZA POLO": 28_500, "CRUZA RECOLETA": 19_800, MILVIDAS: 35_300, "MILVIDAS DIARIO": 14_800, "COSTA RESTO": 26_700, "COSTA CLUB": 18_900, COMEDOR: 31_200, KONA: 22_400, COCHINCHINA: 22_600 }, total: 262_200 },
    { concepto: "Margen Operativo", porLocal: { "LA MALA": 128_000, "CRUZA POLO": 52_900, "CRUZA RECOLETA": 62_100, MILVIDAS: 119_790, "MILVIDAS DIARIO": 38_400, "COSTA RESTO": 76_300, "COSTA CLUB": 45_800, COMEDOR: 89_300, KONA: 61_600, COCHINCHINA: 83_800 }, total: 757_990, esSubtotal: true },
  ],
  detalle: [
    { categoria: "Proteínas", local: "LA MALA", proyectado: 42_000, real: 48_300, variacion: 0.15 },
    { categoria: "Vegetales", local: "LA MALA", proyectado: 12_000, real: 11_500, variacion: -0.041 },
    { categoria: "Bebidas", local: "LA MALA", proyectado: 22_000, real: 23_100, variacion: 0.05 },
    { categoria: "Lácteos", local: "LA MALA", proyectado: 8_000, real: 8_400, variacion: 0.05 },
    { categoria: "Panadería", local: "LA MALA", proyectado: 6_000, real: 5_400, variacion: -0.10 },
    { categoria: "Proteínas", local: "CRUZA POLO", proyectado: 35_000, real: 38_200, variacion: 0.091 },
    { categoria: "Vegetales", local: "CRUZA POLO", proyectado: 10_500, real: 9_900, variacion: -0.057 },
    { categoria: "Bebidas", local: "CRUZA POLO", proyectado: 18_000, real: 19_800, variacion: 0.10 },
  ],
};