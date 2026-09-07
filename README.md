# Sheet Harmony

// matrixParser.js — convierte el MATRIX .xlsx a un JSON limpio para el dashboard

  // Uso:  const data = await parseMatrix(file)   // file = File del <input type=file>

  import * as XLSX from "xlsx";

  /* ────────────────────────────────────────────────────────────────────────

     1) DICCIONARIOS

     ──────────────────────────────────────────────────────────────────────── */

  // Locales canónicos de RESUMEN (orden = orden de columnas en la planilla)

  const LOCALES_RESUMEN = [

    "LA MALA","CRUZA POLO","CRUZA RECOLETA","MILVIDAS","MILVIDAS DIARIO",

    "COSTA RESTO","COSTA CLUB","COSTA GRAL","COMEDOR","KONA","COCHINCHINA","TOTAL",

  ];

  // Subtotales que NO se deben sumar en agregaciones

  const SUBTOTALES_LOCAL = new Set(["COSTA GRAL", "TOTAL"]);

  // Definición del P&L de RESUMEN: se matchea por TEXTO en la columna B (robusto a

  // que se muevan filas). nivel: metrica | subtotal | linea | resultado.

  // signo: +1 ingreso, -1 costo, 0 informativo.

  const PYL_LINES = [

    { match: "total venta bruta",                 key: "VENTA_BRUTA",     categoria: "VENTA",        nivel: "metrica",   signo: 0

  },

    { match: "total venta neta",                  key: "VENTA_NETA",      categoria: "VENTA",        nivel: "metrica",   signo: 0

  },

    { match: "total ingresos",                    key: "INGRESOS",        categoria: "INGRESOS",     nivel: "subtotal",  signo: +1

  },

    { match: "venta f",                           key: "VENTA_F",         categoria: "INGRESOS",     nivel: "linea",     signo: 0

  },

    { match: "venta nf",                          key: "VENTA_NF",        categoria: "INGRESOS",     nivel: "linea",     signo: 0

  },

    { match: "comisiones",                        key: "COMISIONES",      categoria: "COMISIONES",   nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "cmv",                               key: "CMV",             categoria: "CMV",          nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "costo laboral",                     key: "COSTO_LABORAL",   categoria: "COSTO LABORAL",nivel: "subtotal",  signo: -1

  },

    { match: "gastos de operación",               key: "GASTOS_OPERACION",categoria: "OPERACION",    nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "gastos de mantenimiento",           key: "MANTENIMIENTO",   categoria: "MANTENIMIENTO",nivel: "subtotal",  signo: -1

  },

    { match: "comisiones tc y gastos bancarios",  key: "COM_TC_BANCOS",   categoria: "BANCARIO",     nivel: "subtotal",  signo: -1

  },

    { match: "honorarios",                        key: "HONORARIOS",      categoria: "HONORARIOS",   nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "regalias",                          key: "REGALIAS",        categoria: "REGALIAS",     nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "mkt",                               key: "MKT",             categoria: "MKT",          nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "impuestos",                         key: "IMPUESTOS",       categoria: "IMPUESTOS",    nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "total alquiler y expensas",         key: "ALQUILER",        categoria: "OCUPACION",    nivel: "subtotal",  signo: -1

  },

    { match: "total servicios publicos",          key: "SERVICIOS",       categoria: "OCUPACION",    nivel: "subtotal",  signo: -1

  },

    { match: "estructura ng",                     key: "ESTRUCTURA_NG",   categoria: "ESTRUCTURA",   nivel: "subtotal",  signo: -1,

  exact: true },

    { match: "margen de ganancia estimado",       key: "MARGEN",          categoria: "RESULTADO",    nivel: "resultado", signo: 0

  },

  ];

  // Mapa hoja-de-detalle → categoría del P&L (para el drill-down)

  const HOJAS_DETALLE = {

    "VENTAS":                    "VENTA",

    "COMISIONES":                "COMISIONES",

    "COSTO LABORAL":             "COSTO LABORAL",

    "GASTOS DE OCUPACION":       "OCUPACION",

    "GASTOS DE OPERACION Y MTO": "OPERACION",

    "GASTOS DE MUSICALIZACION":  "MKT",

    "AGENCIAS Y RRPP":           "MKT",

    "COMUNICACION Y MKT":        "MKT",

  };

  /* ────────────────────────────────────────────────────────────────────────

     2) HELPERS

     ──────────────────────────────────────────────────────────────────────── */

  const norm = (s) =>

    (s ?? "").toString().trim().toLowerCase()

      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // saca acentos

  // Normaliza nombres de local (typos + variantes entre hojas)

  function normLocal(s) {

    const n = norm(s);

    if (!n) return null;

    if (n.startsWith("cochinch")) return "COCHINCHINA";   // Cochinchoina/Cochinchina

    if (n === "mil vidas") return "MILVIDAS";

    if (n === "costa 7070") return "COSTA 7070";

    return s.toString().trim().toUpperCase();

  }

  // Convierte celda a número. #REF!/#DIV/0!/null/"" → null

  function num(v) {

    if (v === null || v === undefined || v === "") return null;

    if (typeof v === "number") return Number.isFinite(v) ? v : null;

    const s = v.toString().trim();

    if (s.startsWith("#")) return null;                  // errores de Excel

    const cleaned = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");

    const n = parseFloat(cleaned);

    return Number.isFinite(n) ? n : null;

  }

  const isDate = (v) => v instanceof Date && !isNaN(v);

  const toISO  = (d) => (isDate(d) ? d.toISOString().slice(0, 10) : null);

  // hoja → matriz 2D (filas de celdas)

  const grid = (ws) =>

    XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  /* ────────────────────────────────────────────────────────────────────────

     3) PARSER DE RESUMEN  (la espina dorsal: P&L por local)

     ──────────────────────────────────────────────────────────────────────── */

  function parseResumen(wb) {

    const ws = wb.Sheets["RESUMEN"];

    if (!ws) throw new Error("No se encontró la hoja RESUMEN");

    const rows = grid(ws);

    // Fila de nombres de local = la que contiene más locales conocidos

    let nameRow = -1, best = 0;

    rows.slice(0, 6).forEach((r, i) => {

      const hits = (r || []).filter((c) => LOCALES_RESUMEN.includes(normLocal(c))).length;

      if (hits > best) { best = hits; nameRow = i; }

    });

    if (nameRow < 0) throw new Error("No se detectó la fila de locales en RESUMEN");

    // columna → local

    const colLocal = {};

    rows[nameRow].forEach((c, ci) => {

      const L = normLocal(c);

      if (LOCALES_RESUMEN.includes(L)) colLocal[ci] = L;

    });

    // Para cada concepto del P&L, encontrar su fila por texto en col B (índice 1)

    const findRow = (def) =>

      rows.findIndex((r) => {

        const b = norm(r?.[1]);

        return def.exact ? b === def.match : b.includes(def.match);

      });

    const pyl = [];

    for (const def of PYL_LINES) {

      const ri = findRow(def);

      if (ri < 0) continue;

      for (const [ci, local] of Object.entries(colLocal)) {

        const monto = num(rows[ri][ci]);

        if (monto === null) continue;

        pyl.push({

          local, concepto: def.key, categoria: def.categoria,

          nivel: def.nivel, signo: def.signo, monto,

          esSubtotalLocal: SUBTOTALES_LOCAL.has(local),

        });

      }

    }

    const periodo = (rows[0]?.[0] ?? "").toString().trim(); // ej. "Mayo"

    const locales = Object.values(colLocal);

    return { periodo, locales, pyl };

  }

  /* ────────────────────────────────────────────────────────────────────────

     4) PARSER GENÉRICO DE HOJAS DE DETALLE  (drill-down + Proyección vs Real)

     Detecta automáticamente: fila de nombres, fila de header, bloques de

     2 cols (Proyección|Real) o 3 cols (Proveedor|Proyectado|Real), y si la

     hoja es diaria (tiene columna de fecha).

     ──────────────────────────────────────────────────────────────────────── */

  function parseDetail(wb, sheetName) {

    const ws = wb.Sheets[sheetName];

    if (!ws) return [];

    const rows = grid(ws);

    // 1) header row = primera (en las primeras 8) que contenga "real"

    const headerRow = rows.slice(0, 8).findIndex((r) =>

      (r || []).some((c) => /real/i.test(norm(c)))

    );

    if (headerRow < 0) return [];

    const hdr = rows[headerRow];

    // 2) name row = la de arriba con más nombres reconocibles

    let nameRow = 0, best = -1;

    for (let i = 0; i < headerRow; i++) {

      const hits = (rows[i] || []).filter((c) => normLocal(c)).length;

      if (hits > best) { best = hits; nameRow = i; }

    }

    // 3) bloques: cada columna "real" / "costo real" define un local

    const blocks = [];

    hdr.forEach((c, ci) => {

      if (!/^(costo )?real$/.test(norm(c))) return;

      const hasProv = /proveedor/.test(norm(hdr[ci - 2]));

      const proyCol = ci - 1;

      const provCol = hasProv ? ci - 2 : null;

      // local = nombre más cercano a la izquierda en la fila de nombres

      let local = null;

      for (let k = ci; k >= 0; k--) {

        const L = normLocal(rows[nameRow]?.[k]);

        if (L) { local = L; break; }

      }

      blocks.push({ local, realCol: ci, proyCol, provCol });

    });

    // 4) ¿hoja diaria? (alguna fila de datos tiene Date en col 0 o 1)

    const dateCol = [0, 1].find((c) =>

      rows.slice(headerRow + 1, headerRow + 12).some((r) => isDate(r?.[c]))

    );

    // 5) recorrer filas de datos

    const out = [];

    for (let ri = headerRow + 1; ri < rows.length; ri++) {

      const r = rows[ri];

      if (!r) continue;

      const fecha = dateCol != null ? toISO(r[dateCol]) : null;

      const categoria = dateCol == null ? (r[0] ?? "").toString().trim() : null;

      if (dateCol == null && !categoria) continue;       // fila vacía

      if (dateCol != null && !fecha) continue;

      for (const b of blocks) {

        const real = num(r[b.realCol]);

        const proy = num(r[b.proyCol]);

        if (real === null && proy === null) continue;

        out.push({

          hoja: sheetName,

          categoriaPyl: HOJAS_DETALLE[sheetName] ?? null,

          local: b.local,

          ...(fecha ? { fecha } : {}),

          ...(categoria ? { item: categoria } : {}),

          ...(b.provCol != null ? { proveedor: (r[b.provCol] ?? "").toString().trim() || null } : {}),

          proyeccion: proy,

          real,

        });

      }

    }

    return out;

  }

  /* ────────────────────────────────────────────────────────────────────────

     5) ORQUESTADOR

     ──────────────────────────────────────────────────────────────────────── */

  export async function parseMatrix(file) {

    const buf = await file.arrayBuffer();

    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    const { periodo, locales, pyl } = parseResumen(wb);

    let detalle = [];

    for (const hoja of Object.keys(HOJAS_DETALLE)) {

      detalle = detalle.concat(parseDetail(wb, hoja));

    }

    // KPIs rápidos del grupo (excluye subtotales COSTA GRAL y TOTAL)

    const reales = pyl.filter((p) => !p.esSubtotalLocal);

    const sumKey = (k) =>

      reales.filter((p) => p.concepto === k).reduce((a, p) => a + p.monto, 0);

    const kpis = {

      ventaBruta: sumKey("VENTA_BRUTA"),

      ingresos:   sumKey("INGRESOS"),

      cmv:        sumKey("CMV"),

      costoLaboral: sumKey("COSTO_LABORAL"),

      margen:     sumKey("MARGEN"),

    };

    kpis.margenPct = kpis.ingresos ? kpis.margen / kpis.ingresos : null;

    return { periodo, locales, kpis, pyl, detalle };

  }

  Cómo usarlo en Lovable (componente de carga):

  import { parseMatrix } from "./matrixParser";

  function Uploader({ onData }) {

    const handleFile = async (e) => {

      const file = e.target.files?.[0];

      if (!file) return;

      const data = await parseMatrix(file);   // { periodo, locales, kpis, pyl, detalle }

      onData(data);

    };

    return <input type="file" accept=".xlsx" onChange={handleFile} />;

  }

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://matrix-op.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/51957063-6894-4a1a-b96e-8cc013a3fb64).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
