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
  esGrupo?: boolean;
};

export type DetalleRow = {
  categoria: string;
  local: LocalKey;
  proyectado: number;
  real: number;
  variacion: number;
};

export type MatrixOrigin = "matrix" | "gastos";

export type MatrixData = {
  periodo: Periodo;
  locales: LocalKey[];
  kpis: KPI[];
  pyl: PyLRow[];
  detalle: DetalleRow[];
  proyecciones?: Record<LocalKey, number>;
  excluidosDeTotal?: LocalKey[];
  gastos?: GastoRow[];
  origen: MatrixOrigin;
};

export type GastoRow = {
  local: LocalKey;
  fechaPago: string; // ISO yyyy-mm-dd
  fecha?: string;
  concepto: string;
  imputacion: string;
  grupo: string;
  monto: number;
  semana?: string;
  mes?: string;
  formaPago?: string;
  alias?: string;
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

const localKey = (s: unknown) =>
  normalize(s)
    .replace(/costa\s*gral/g, "costa7070")
    .replace(/[^a-z0-9]/g, "");

export async function parseMatrix(file: File): Promise<MatrixData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Router: si el archivo tiene estructura de Base de Gastos, delegar.
  // No dependemos del nombre de la hoja ni de una fila fija: buscamos columnas clave.
  const gastos = parseGastosWorkbook(wb, file);
  if (gastos) return gastos;

  // Buscar hoja RESUMEN (la matriz consolidada por local).
  const sheetName =
    wb.SheetNames.find((n) => /resumen/i.test(n)) ??
    wb.SheetNames.find((n) => /matrix|pl/i.test(n)) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  });

  // Detectar fila de cabecera de locales: la que contenga varios nombres
  // de local (texto en celdas alternadas) y NO "concepto"/"grupo".
  // En el template MATRIX, los locales están en la fila 3 (index 2),
  // columnas 4, 8, 12, ... (cada 4 columnas).
  let headerIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] ?? [];
    const textCells = row.filter(
      (c) => typeof c === "string" && c.trim().length > 1
    );
    if (textCells.length >= 3) {
      const joined = textCells.map((c) => String(c).toLowerCase()).join(" ");
      if (/(mala|cruza|costa|comedor|kona|cochinchina|milvidas|local|sucursal)/.test(joined)) {
        headerIdx = r;
        break;
      }
    }
  }
  if (headerIdx < 0) headerIdx = 2; // default a fila 3 del template MATRIX

  const header = rows[headerIdx] ?? [];
  const locales: LocalKey[] = [];
  const localCols: number[] = [];
  header.forEach((c, i) => {
    const v = String(c ?? "").trim();
    if (i === 0) return;
    if (!v) return;
    if (/^(matrix|concepto|grupo|total|proyecci[oó]n|real|%|var)/i.test(v)) return;
    if (/milvidas\s*diario/i.test(v)) return;
    locales.push(v);
    localCols.push(i);
  });

  // Locales que NO suman al total (son agregaciones de otros, ej. COSTA GRAL = COSTA RESTO + COSTA CLUB)
  const excluidosDeTotal: LocalKey[] = locales.filter((l) => /costa\s*gral/i.test(l));
  const excludedSet = new Set(excluidosDeTotal);

  const pyl: PyLRow[] = [];
  const subtotalRe =
    /^(total|margen|utilidad|ebitda|bruto|cmv|costo laboral|gastos de|comisiones tc|honorarios|regalias|mkt|impuestos|estructura|ingresos)/i;

  // Un "grupo" es la primera fila no vacía después de una fila en blanco.
  // Sus filas siguientes (sin blanco intermedio) se consideran hijas.
  let prevBlank = true;
  let currentGroup: string | undefined;
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const concepto = String(row[1] ?? row[0] ?? "").trim();
    if (!concepto) {
      prevBlank = true;
      continue;
    }
    const porLocal: Record<string, number> = {};
    let total = 0;
    let hasValue = false;
    localCols.forEach((ci, k) => {
      const v = num(row[ci]);
      porLocal[locales[k]] = v;
      if (!excludedSet.has(locales[k])) total += v;
      if (v) hasValue = true;
    });
    if (!hasValue && !/^(total|margen)/i.test(concepto)) {
      prevBlank = false;
      continue;
    }
    const esGrupo = prevBlank;
    if (esGrupo) currentGroup = concepto;
    pyl.push({
      concepto,
      grupo: esGrupo ? undefined : currentGroup,
      porLocal,
      total,
      esSubtotal: subtotalRe.test(concepto),
      esGrupo,
    });
    prevBlank = false;
  }

  // KPIs derivados
  const find = (re: RegExp) =>
    pyl.find((p) => re.test(normalize(p.concepto)))?.total ?? 0;

  const venta =
    find(/^total\s*ingresos/) ||
    find(/^total\s*venta\s*neta/) ||
    find(/venta\s*neta/) ||
    find(/venta|ingreso|revenue/);
  const cmv = find(/^cmv\b|costo.*mercader|food.*cost/);
  const laboral = find(/^costo\s*laboral|mano.*obra/);
  const margen = venta ? (venta - cmv - laboral) / venta : 0;

  // Placeholder; deltas se completan más abajo, cuando ya leímos las proyecciones.
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

  // El template guarda el mes en A1 de RESUMEN (ej. "Mayo").
  const a1 = String(rows[0]?.[0] ?? "").trim();
  const mes = a1 || sheetName;
  // Intentar extraer año del nombre de archivo (MATRIX_MMYYYY_*.xlsx)
  const fname = (file as File).name ?? "";
  const yMatch = fname.match(/(\d{2})(\d{4})/);
  const anio = yMatch ? Number(yMatch[2]) : new Date().getFullYear();
  const periodo: Periodo = { mes, anio };

  // Proyección de TOTAL VENTA BRUTA por local (hoja VENTAS)
  const proyecciones: Record<LocalKey, number> = {};
  const ventasSheetName = wb.SheetNames.find((n) => /^ventas?$/i.test(n));
  if (ventasSheetName) {
    const vRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[ventasSheetName], {
      header: 1,
      defval: null,
      blankrows: true,
    });
    const vHeader = vRows[0] ?? [];
    const subHeader = vRows.find((r) =>
      (r ?? []).some((c) => /proyecci[oó]n/i.test(String(c ?? "")))
    );
    // Mapear columna de proyección por local: en VENTAS cada local tiene
    // columnas Proyección/Real y luego los nombres se repiten en el bloque de variación.
    const localCol: Record<string, number> = {};
    vHeader.forEach((c, i) => {
      const v = String(c ?? "").trim();
      if (!v || i < 3) return;
      if (/^mayo|^enero|^febrero|^marzo|^abril|^junio|^julio|^agosto|^septiembre|^octubre|^noviembre|^diciembre/i.test(v)) return;
      if (subHeader && !/proyecci[oó]n/i.test(String(subHeader[i] ?? ""))) return;
      const key = localKey(v);
      if (!localCol[key]) localCol[key] = i;
    });
    const bruta = vRows.find((r) => /total\s*venta\s*bruta/i.test(String(r?.[0] ?? "")));
    if (bruta) {
      for (const loc of locales) {
        const ci = localCol[localKey(loc)];
        if (ci !== undefined) {
          const proy = num(bruta[ci]);
          if (proy) proyecciones[loc] = proy;
        }
      }
    }
  }

  // Delta Venta Neta vs proyección total (suma de locales no excluidos del total)
  const proyTotal = Object.entries(proyecciones)
    .filter(([loc]) => !excludedSet.has(loc))
    .reduce((a, [, v]) => a + v, 0);
  if (proyTotal && venta) {
    kpis[0].delta = (venta - proyTotal) / venta;
  }

  return { periodo, locales, kpis, pyl, detalle, proyecciones, excluidosDeTotal, origen: "matrix" };
}

// -------------------- Parser Base Gastos Semanales --------------------

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial (epoch 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function canonLocal(s: unknown): string {
  const n = normalize(s).replace(/\s+/g, " ").trim();
  const map: Record<string, string> = {
    "la mala": "LA MALA",
    "cruza polo": "CRUZA POLO",
    "crz polo": "CRUZA POLO",
    "cruza recoleta": "CRUZA RECOLETA",
    "crz recoleta": "CRUZA RECOLETA",
    "costa": "COSTA GRAL",
    "costa gral": "COSTA GRAL",
    "costa resto": "COSTA RESTO",
    "costa club": "COSTA CLUB",
    "milvidas": "MILVIDAS",
    "kona": "KONA",
    "cochinchina": "COCHINCHINA",
    "comedor": "COMEDOR",
  };
  return map[n] ?? String(s ?? "").toUpperCase().trim();
}

// Esqueleto EXACTO de la matriz P&L (RESUMEN). Cada entry: [concepto, parent|null]
// parent === null → fila raíz (grupo o subtotal). parent !== null → hijo (subcategoría).
type SkelItem = { concepto: string; parent: string | null; esGrupo?: boolean; esSubtotal?: boolean };
const MATRIX_SKELETON: SkelItem[] = [
  { concepto: "TOTAL VENTA BRUTA", parent: null, esSubtotal: true },
  { concepto: "TOTAL VENTA NETA", parent: null, esSubtotal: true },
  { concepto: "TOTAL INGRESOS", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "VENTA F", parent: "TOTAL INGRESOS" },
  { concepto: "VENTA NF", parent: "TOTAL INGRESOS" },
  { concepto: "OTROS INGRESOS", parent: "TOTAL INGRESOS" },
  { concepto: "COMISIONES", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "Eventos", parent: "COMISIONES" },
  { concepto: "Comisiones por venta", parent: "COMISIONES" },
  { concepto: "Comisiones por MP", parent: "COMISIONES" },
  { concepto: "Otras Comisiones", parent: "COMISIONES" },
  { concepto: "CMV", parent: null, esSubtotal: true },
  { concepto: "COSTO LABORAL", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "TOTAL SUELDOS", parent: "COSTO LABORAL" },
  { concepto: "TOTAL CARGAS SOCIALES", parent: "COSTO LABORAL" },
  { concepto: "EXTRAS", parent: "COSTO LABORAL" },
  { concepto: "LIQUIDACIONES", parent: "COSTO LABORAL" },
  { concepto: "ACUERDOS LABORALES", parent: "COSTO LABORAL" },
  { concepto: "OTROS", parent: "COSTO LABORAL" },
  { concepto: "GASTOS DE OPERACIÓN", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "TOTAL SEGURIDAD VIGILANTES", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "TOTAL INTELIGENCIA", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "PORTERO", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "LIMPIEZA", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "BAZAR & VAJILLA", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "LIBRERÍA", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "VIÁTICOS", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "FLETES", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "SEGUROS", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "COMPRAS EQUIPAMIENTOS", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "UNIFORMES", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "TOTAL VALET PARKING", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "TOTAL VELAS", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "TOTAL PARQUIZADO", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "COMPRAS EQUIPAMIENTO ELECTRÓNICO", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "COMPRAS EQUIPAMIENTO GASTRONÓMICO", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "PULSERAS", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "CATERING", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "TOTAL LAVADERO", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "COMIDA DE PERSONAL", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "VALIDADORES", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "OTROS GASTOS DE OPERACIÓN", parent: "GASTOS DE OPERACIÓN" },
  { concepto: "GASTOS DE MANTENIMIENTO", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "MANTENIMIENTO LOCALES", parent: "GASTOS DE MANTENIMIENTO" },
  { concepto: "MANTENIMIENTO SERVICIOS", parent: "GASTOS DE MANTENIMIENTO" },
  { concepto: "MANTENIMIENTO SISTEMAS", parent: "GASTOS DE MANTENIMIENTO" },
  { concepto: "COMISIONES TC Y GASTOS BANCARIOS", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "GASTOS BANCARIOS", parent: "COMISIONES TC Y GASTOS BANCARIOS" },
  { concepto: "COMISIONES TC", parent: "COMISIONES TC Y GASTOS BANCARIOS" },
  { concepto: "HONORARIOS", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "TOTAL HONORARIOS", parent: "HONORARIOS" },
  { concepto: "REGALIAS", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "REGALIAS ", parent: "REGALIAS" },
  { concepto: "MKT", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "TOTAL ALQUILER EQUIPOS TECNICA", parent: "MKT" },
  { concepto: "TOTAL TECNICOS", parent: "MKT" },
  { concepto: "TOTAL SADAIC Y AADICAPIG", parent: "MKT" },
  { concepto: "TOTAL OTROS GASTOS", parent: "MKT" },
  { concepto: "TOTAL BAILARINAS", parent: "MKT" },
  { concepto: "TOTAL REPARACION EQUIPOS SONIDO", parent: "MKT" },
  { concepto: "TOTAL DJ Y BANDAS", parent: "MKT" },
  { concepto: "TOTAL AGENCIAS", parent: "MKT" },
  { concepto: "TOTAL PR", parent: "MKT" },
  { concepto: "TOTAL FOTOGRAFIA", parent: "MKT" },
  { concepto: "TOTAL VIDEO", parent: "MKT" },
  { concepto: "DISEÑO REDES", parent: "MKT" },
  { concepto: "DISEÑO MENU", parent: "MKT" },
  { concepto: "GRAFICA PLOTEOS", parent: "MKT" },
  { concepto: "GRAFICA/IMPRESIONES PAPEL/PLASTIFICADO", parent: "MKT" },
  { concepto: "PAUTAS EN REDES", parent: "MKT" },
  { concepto: "TOTAL MENSAJERIA", parent: "MKT" },
  { concepto: "TOTAL PROGRAMADOR", parent: "MKT" },
  { concepto: "TOTAL ACCIONES DE MARKETING", parent: "MKT" },
  { concepto: "TOTAL TIKTOK", parent: "MKT" },
  { concepto: "TOTAL MODERACION REDES", parent: "MKT" },
  { concepto: "TOTAL OTROS GASTOS DE COMUNICACION", parent: "MKT" },
  { concepto: "TOTAL PRENSA", parent: "MKT" },
  { concepto: "TOTAL AMBIENTACION", parent: "MKT" },
  { concepto: "TOTAL MERCADERIA SIN CARGO", parent: "MKT" },
  { concepto: "TOTAL ACUERDOS COMERCIALES", parent: "MKT" },
  { concepto: "TOTAL INVITACIONES", parent: "MKT" },
  { concepto: "IMPUESTOS", parent: null, esSubtotal: true },
  { concepto: "TOTAL ALQUILER Y EXPENSAS", parent: null, esGrupo: true, esSubtotal: true },
  { concepto: "TOTAL SERVICIOS PUBLICOS", parent: null, esSubtotal: true },
  { concepto: "ESTRUCTURA NG", parent: null, esSubtotal: true },
  { concepto: "MARGEN DE GANANCIA ESTIMADO", parent: null, esSubtotal: true },
];

// Mapea imputación del archivo de gastos → concepto exacto del esqueleto matrix
function conceptoDeImputacion(imp: string): string {
  const n = normalize(imp);
  const map: Record<string, string> = {
    "dj": "TOTAL DJ Y BANDAS",
    "pr": "TOTAL PR",
    "bailarinas": "TOTAL BAILARINAS",
    "seguridad": "TOTAL SEGURIDAD VIGILANTES",
    "seguridad intel": "TOTAL INTELIGENCIA",
    "inteligencia": "TOTAL INTELIGENCIA",
    "portero": "PORTERO",
    "porteros": "PORTERO",
    "bombero": "OTROS GASTOS DE OPERACIÓN",
    "bomberos": "OTROS GASTOS DE OPERACIÓN",
    "iluminador": "TOTAL TECNICOS",
    "vj": "TOTAL TECNICOS",
    "tecnico": "TOTAL TECNICOS",
    "tecnicos": "TOTAL TECNICOS",
    "limpieza": "LIMPIEZA",
    "valet": "TOTAL VALET PARKING",
    "valet parking": "TOTAL VALET PARKING",
    "fotografia": "TOTAL FOTOGRAFIA",
    "video": "TOTAL VIDEO",
    "prensa": "TOTAL PRENSA",
    "ambientacion": "TOTAL AMBIENTACION",
    "agencia": "TOTAL AGENCIAS",
    "agencias": "TOTAL AGENCIAS",
  };
  return map[n] ?? "OTROS GASTOS DE OPERACIÓN";
}

function parseGastosWorkbook(wb: XLSX.WorkBook, file: File): MatrixData | null {
  // Header típico: Local, Calendario, Fecha de pago, Semana, Mes, Concepto, Monto, Imputación...
  // No asumimos nombre de hoja ni fila fija: buscamos esa cabecera en todo el libro.
  let detName = "";
  let rows: unknown[][] = [];
  let headerIdx = -1;
  let header: unknown[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheetRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      blankrows: false,
    });
    for (let r = 0; r < Math.min(sheetRows.length, 35); r++) {
      const candidate = sheetRows[r] ?? [];
      const joined = candidate.map((c) => normalize(c)).join("|");
      if (/\blocal\b/.test(joined) && /concepto/.test(joined) && /monto/.test(joined) && /imputaci/.test(joined)) {
        detName = sheetName;
        rows = sheetRows;
        headerIdx = r;
        header = candidate;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }

  if (headerIdx < 0) return null;

  const col = (re: RegExp) => header.findIndex((h) => re.test(normalize(h)));
  const cLocal = col(/^local$/);
  const cFechaPago = col(/fecha.*pago/);
  const cFecha = col(/calendario|^fecha$/);
  const cSemana = col(/^semana$/);
  const cMes = col(/^mes$/);
  const cConcepto = col(/^concepto$/);
  const cMonto = col(/^monto$/);
  const cImp = col(/imputaci/);
  const cForma = col(/forma.*pago/);
  const cAlias = col(/alias/);
  if (cLocal < 0 || cMonto < 0 || cImp < 0 || cConcepto < 0) return null;

  const gastos: GastoRow[] = [];
  const localesSet = new Set<string>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const local = canonLocal(row[cLocal]);
    const imp = String(row[cImp] ?? "").trim();
    const concepto = String(row[cConcepto] ?? "").trim();
    const monto = num(row[cMonto]);
    if (!local || !imp || !concepto || !monto) continue;
    localesSet.add(local);
    const fp = toDate(row[cFechaPago]);
    const fx = toDate(row[cFecha]);
    gastos.push({
      local,
      fechaPago: toISO(fp),
      fecha: toISO(fx),
      concepto,
      imputacion: imp,
      grupo: conceptoDeImputacion(imp),
      monto,
      semana: cSemana >= 0 ? String(row[cSemana] ?? "") : undefined,
      mes: cMes >= 0 ? String(row[cMes] ?? "") : undefined,
      formaPago: cForma >= 0 ? String(row[cForma] ?? "") : undefined,
      alias: cAlias >= 0 ? String(row[cAlias] ?? "") : undefined,
    });
  }

  if (!gastos.length) return null;

  // Locales del auxiliar (para completar columnas aunque no tengan gastos)
  const auxName = wb.SheetNames.find((n) => /auxiliar/i.test(n));
  if (auxName) {
    const aux: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[auxName], {
      header: 1,
      defval: null,
      blankrows: false,
    });
    for (let r = 1; r < aux.length; r++) {
      const v = aux[r]?.[0];
      if (v) localesSet.add(canonLocal(v));
    }
  }

  // Orden canónico
  const orden = [
    "LA MALA","CRUZA POLO","CRUZA RECOLETA",
    "COSTA RESTO","COSTA CLUB","COSTA GRAL",
    "MILVIDAS","KONA","COCHINCHINA","COMEDOR",
  ];
  // Mantener SIEMPRE los locales canónicos de la matriz (aunque no haya gastos en algunos)
  const extra = [...localesSet].filter((l) => !orden.includes(l));
  const locales = [...orden, ...extra];
  const excluidosDeTotal = locales.filter((l) => /costa\s*gral/i.test(l));
  const excluded = new Set(excluidosDeTotal);

  // Construir P&L con ESTRUCTURA COMPLETA de la matriz (todas las subcategorías,
  // aunque estén vacías). Solo se completan las filas mapeadas desde gastos.
  const emptyPorLocal = (): Record<string, number> => {
    const o: Record<string, number> = {};
    for (const l of locales) o[l] = 0;
    return o;
  };

  // Aggregar gastos por concepto destino
  const perConcepto = new Map<string, { porLocal: Record<string, number>; total: number }>();
  for (const g of gastos) {
    const key = g.grupo; // ya mapeado a concepto del esqueleto
    if (!perConcepto.has(key)) perConcepto.set(key, { porLocal: emptyPorLocal(), total: 0 });
    const acc = perConcepto.get(key)!;
    acc.porLocal[g.local] = (acc.porLocal[g.local] ?? 0) + g.monto;
    if (!excluded.has(g.local)) acc.total += g.monto;
  }

  // Sumas por padre (grupo) a partir de sus hijos
  const parentAgg = new Map<string, { porLocal: Record<string, number>; total: number }>();
  for (const it of MATRIX_SKELETON) {
    if (!it.parent) continue;
    const acc = perConcepto.get(it.concepto);
    if (!acc) continue;
    if (!parentAgg.has(it.parent)) parentAgg.set(it.parent, { porLocal: emptyPorLocal(), total: 0 });
    const p = parentAgg.get(it.parent)!;
    for (const [loc, v] of Object.entries(acc.porLocal)) {
      p.porLocal[loc] = (p.porLocal[loc] ?? 0) + v;
    }
    p.total += acc.total;
  }

  const pyl: PyLRow[] = MATRIX_SKELETON.map((it) => {
    const data = it.parent ? perConcepto.get(it.concepto) : parentAgg.get(it.concepto);
    return {
      concepto: it.concepto,
      grupo: it.parent ?? undefined,
      porLocal: data?.porLocal ?? emptyPorLocal(),
      total: data?.total ?? 0,
      esGrupo: it.esGrupo,
      esSubtotal: it.esSubtotal,
    };
  });

  // KPIs con la MISMA estructura que MATRIX, todo en 0
  const kpis: KPI[] = [
    { label: "Venta Neta", value: 0 },
    { label: "CMV", value: 0, pct: 0 },
    { label: "Costo Laboral", value: 0, pct: 0 },
    { label: "Margen Operativo", value: 0, pct: 0 },
  ];

  // Periodo desde Resumen (fila 2: Desde / Hasta)
  let mes = "";
  let anio: number | string = new Date().getFullYear();
  const resName = wb.SheetNames.find((n) => /resumen/i.test(n));
  if (resName) {
    const resRows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[resName], {
      header: 1, defval: null, blankrows: true,
    });
    const desde = toDate(resRows[1]?.[1]);
    if (desde) {
      mes = MESES[desde.getMonth()];
      anio = desde.getFullYear();
    }
  }
  if (!mes && gastos.length) {
    const d = toDate(gastos[0].fechaPago);
    if (d) { mes = MESES[d.getMonth()]; anio = d.getFullYear(); }
  }

  // Detalle: cada gasto como fila drill-down
  const detalle: DetalleRow[] = gastos.map((g) => ({
    categoria: `${g.concepto} · ${g.fechaPago}`,
    local: g.local,
    proyectado: 0,
    real: g.monto,
    variacion: 0,
  }));

  return {
    periodo: { mes: mes || "—", anio },
    locales,
    kpis,
    pyl,
    detalle,
    excluidosDeTotal,
    gastos,
    // Mantener la misma UI que MATRIX
    origen: "matrix",
  };
}

// Re-agrega gastos filtrados por rango de fecha (fechaPago), devolviendo un
// MatrixData con el pyl reconstruido sobre el esqueleto oficial.
export function filterMatrixByPeriod(
  base: MatrixData,
  from?: string,
  to?: string,
): MatrixData {
  if (!base.gastos?.length) return base;
  const f = from ? new Date(from).getTime() : -Infinity;
  const t = to ? new Date(to).getTime() + 86400000 - 1 : Infinity;
  const gastos = base.gastos.filter((g) => {
    const ts = g.fechaPago ? new Date(g.fechaPago).getTime() : NaN;
    if (!isFinite(ts)) return true;
    return ts >= f && ts <= t;
  });
  const locales = base.locales;
  const excluded = new Set(base.excluidosDeTotal ?? []);
  const emptyPorLocal = (): Record<string, number> =>
    Object.fromEntries(locales.map((l) => [l, 0]));
  const perConcepto = new Map<string, { porLocal: Record<string, number>; total: number }>();
  for (const g of gastos) {
    const key = g.grupo;
    if (!perConcepto.has(key)) perConcepto.set(key, { porLocal: emptyPorLocal(), total: 0 });
    const acc = perConcepto.get(key)!;
    acc.porLocal[g.local] = (acc.porLocal[g.local] ?? 0) + g.monto;
    if (!excluded.has(g.local)) acc.total += g.monto;
  }
  const parentAgg = new Map<string, { porLocal: Record<string, number>; total: number }>();
  for (const it of MATRIX_SKELETON) {
    if (!it.parent) continue;
    const acc = perConcepto.get(it.concepto);
    if (!acc) continue;
    if (!parentAgg.has(it.parent)) parentAgg.set(it.parent, { porLocal: emptyPorLocal(), total: 0 });
    const p = parentAgg.get(it.parent)!;
    for (const [loc, v] of Object.entries(acc.porLocal)) p.porLocal[loc] = (p.porLocal[loc] ?? 0) + v;
    p.total += acc.total;
  }
  const pyl: PyLRow[] = MATRIX_SKELETON.map((it) => {
    const data = it.parent ? perConcepto.get(it.concepto) : parentAgg.get(it.concepto);
    return {
      concepto: it.concepto,
      grupo: it.parent ?? undefined,
      porLocal: data?.porLocal ?? emptyPorLocal(),
      total: data?.total ?? 0,
      esGrupo: it.esGrupo,
      esSubtotal: it.esSubtotal,
    };
  });
  return { ...base, pyl, gastos };
}

// Demo data para mostrar el dashboard sin archivo cargado
export const demoData: MatrixData = {
  origen: "matrix",
  periodo: { mes: "OCT", anio: 2025 },
  locales: [
    "LA MALA",
    "CRUZA POLO",
    "CRUZA RECOLETA",
    "MILVIDAS",
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