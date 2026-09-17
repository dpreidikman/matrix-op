import { createServerFn } from "@tanstack/react-start";

// Acceso a la base GEDIS (SQL Server) — tabla ResumenXTurno.
//
// Credenciales: NUNCA viven en el repo. Se leen de variables de entorno
// server-only (GEDIS_DB_HOST, GEDIS_DB_PORT, GEDIS_DB_NAME, GEDIS_DB_USER,
// GEDIS_DB_PASSWORD), que hay que cargar en Lovable Cloud → configuración
// del proyecto / secrets del entorno (igual que ya se hace con
// VINSON_USERNAME / VINSON_PASSWORD). Para desarrollo local, se pueden
// definir en un .env.local (gitignored) que Vite carga automáticamente.
//
// Nota de infraestructura: esta app se despliega como Cloudflare Worker.
// El driver `mssql` usa sockets TCP crudos (vía tedious), que Cloudflare
// Workers soporta de forma limitada/beta — si esto falla en producción con
// un error de conexión, hay que migrar a un esquema de sincronización
// (ej. un job aparte que vuelque los datos a una tabla de Supabase, como ya
// se hace con Vinson) en vez de conectar directo desde el Worker.

type GedisValue = string | number | boolean | null;
type GedisRow = Record<string, GedisValue>;

// mssql puede devolver Date/Buffer/etc. — se normaliza a valores JSON-serializables
// (createServerFn valida en tipo que la respuesta sea serializable).
function toSerializable(v: unknown): GedisValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v)) return v.toString("base64");
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

function sanitizeRow(row: Record<string, unknown>): GedisRow {
  const out: GedisRow = {};
  for (const [k, v] of Object.entries(row)) out[k] = toSerializable(v);
  return out;
}

async function queryResumenXTurno(limit: number): Promise<{ columns: string[]; rows: GedisRow[]; total: number }> {
  const user = process.env.GEDIS_DB_USER;
  const password = process.env.GEDIS_DB_PASSWORD;
  if (!user || !password) {
    throw new Error(
      "Faltan las variables de entorno GEDIS_DB_USER / GEDIS_DB_PASSWORD. Cargalas en Lovable Cloud (configuración del proyecto → variables de entorno / secrets).",
    );
  }

  const mod = await import("mssql");
  // mssql es CommonJS: según el interop, la API real puede estar en `default`.
  const sql = ((mod as unknown as { default?: unknown }).default ?? mod) as typeof import("mssql");
  if (typeof (sql as { ConnectionPool?: unknown }).ConnectionPool !== "function") {
    throw new Error("No se pudo cargar el driver de SQL Server (mssql) en este entorno.");
  }
  const config: import("mssql").config = {
    server: process.env.GEDIS_DB_HOST || "gedis.ar",
    port: Number(process.env.GEDIS_DB_PORT || 1435),
    database: process.env.GEDIS_DB_NAME || "CentralCosta",
    user,
    password,
    options: { encrypt: true, trustServerCertificate: true },
    connectionTimeout: 10_000,
    requestTimeout: 20_000,
  };

  const pool = new sql.ConnectionPool(config);
  try {
    await pool.connect();
    const [countResult, dataResult] = await Promise.all([
      pool.request().query("SELECT COUNT(*) AS total FROM ResumenXTurno"),
      pool.request().query(`SELECT TOP (${limit}) * FROM ResumenXTurno`),
    ]);
    const rawRows = dataResult.recordset as Record<string, unknown>[];
    const columns = Object.keys(dataResult.recordset.columns ?? rawRows[0] ?? {});
    const rows = rawRows.map(sanitizeRow);
    const total = Number(countResult.recordset[0]?.total ?? rows.length);
    return { columns, rows, total };
  } finally {
    await pool.close();
  }
}

export const getGedisResumenXTurno = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ columns: string[]; rows: GedisRow[]; total: number }> => {
    return queryResumenXTurno(300);
  },
);
