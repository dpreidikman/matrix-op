import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BASE = "https://apireportes.vinson.com.ar";

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const username = process.env.VINSON_USERNAME;
  const password = process.env.VINSON_PASSWORD;
  if (!username || !password) throw new Error("Vinson credentials missing");

  const res = await fetch(`${BASE}/api/Auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Login failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as { token: string };
  // Decode exp from JWT
  let exp = now + 60 * 60;
  try {
    const payload = JSON.parse(
      Buffer.from(json.token.split(".")[1], "base64").toString("utf8"),
    );
    if (typeof payload.exp === "number") exp = payload.exp;
  } catch {
    /* ignore */
  }
  cachedToken = { token: json.token, exp };
  return json.token;
}

// Date is YYYY-MM-DD from the input; API expects YYYYMMDD.
function toApiDate(iso: string): string {
  return iso.replace(/-/g, "");
}

export type VinsonShift = {
  sale: string;
  date: string;
  shift: string;
};

export const getVinsonSales = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      idTienda: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{ shifts: VinsonShift[]; warning?: string }> => {
      const url = `${BASE}/api/Sales/GetSalesPerStorePerShift/${data.idTienda}/${toApiDate(data.date)}`;

      const call = async () => {
        const token = await getToken();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          return await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      };

      try {
        let res = await call();
        if (res.status === 401 || res.status === 403) {
          cachedToken = null;
          res = await call();
        }

        if (!res.ok) {
          const body = await res.text();
          // Vinson reports missing days and temporary database-pool exhaustion
          // as 400 responses. Neither should take down the whole dashboard.
          if (
            res.status === 400 &&
            /Object reference|Timeout expired|connection from the pool|max pool size/i.test(body)
          ) {
            return {
              shifts: [],
              warning: /Timeout expired|connection from the pool|max pool size/i.test(body)
                ? "Vinson está temporalmente ocupado; este día no pudo cargarse."
                : "La API no devolvió datos para esta tienda/fecha.",
            };
          }
          throw new Error(`Sales fetch failed [${res.status}]: ${body}`);
        }

        const shifts = (await res.json()) as VinsonShift[];
        return { shifts };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return {
            shifts: [],
            warning: "Vinson demoró demasiado; este día no pudo cargarse.",
          };
        }
        throw error;
      }
    },
  );

function* eachDate(fromIso: string, toIso: string) {
  const start = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    yield `${y}-${m}-${day}`;
  }
}

export const getVinsonSalesRange = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      idTienda: z.number().int().positive(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(
    async ({ data }): Promise<{ total: number; days: number; missing: number }> => {
      const dates: string[] = [];
      for (const d of eachDate(data.from, data.to)) dates.push(d);
      // Cap to avoid runaway loops
      const bounded = dates.slice(0, 400);

      let total = 0;
      let missing = 0;

      const call = async (dateIso: string) => {
        const url = `${BASE}/api/Sales/GetSalesPerStorePerShift/${data.idTienda}/${toApiDate(dateIso)}`;
        const doFetch = async () => {
          const token = await getToken();
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          try {
            return await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
              signal: ctrl.signal,
            });
          } finally {
            clearTimeout(timer);
          }
        };
        let res = await doFetch();
        if (res.status === 401 || res.status === 403) {
          cachedToken = null;
          res = await doFetch();
        }
        if (!res.ok) {
          const body = await res.text();
          if (res.status === 400 && /Object reference/i.test(body)) return null;
          throw new Error(`Sales fetch failed [${res.status}] on ${dateIso}: ${body}`);
        }
        return (await res.json()) as VinsonShift[];
      };

      // Higher concurrency + per-request timeout so slow days don't stall the whole range
      const CONCURRENCY = 10;
      for (let i = 0; i < bounded.length; i += CONCURRENCY) {
        const chunk = bounded.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map((d) => call(d).catch((e) => { console.warn("[vinson] day failed", d, e?.message); return null; })),
        );
        for (const r of results) {
          if (!r) {
            missing++;
            continue;
          }
          for (const s of r) total += Number(s.sale ?? 0);
        }
      }

      console.log(`[vinson] range ${data.idTienda} ${data.from}→${data.to}: total=${total} days=${bounded.length} missing=${missing}`);
      return { total, days: bounded.length, missing };
    },
  );