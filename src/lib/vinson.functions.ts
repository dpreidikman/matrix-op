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
        return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      };

      let res = await call();
      if (res.status === 401 || res.status === 403) {
        cachedToken = null;
        res = await call();
      }

      if (!res.ok) {
        const body = await res.text();
        // The upstream API returns 400 + "Object reference not set to an
        // instance of an object." for stores/dates it cannot resolve
        // (e.g. tiendas migradas a VinsonPOS). Treat as "no data" instead
        // of a hard error so the UI stays usable.
        if (res.status === 400 && /Object reference/i.test(body)) {
          return {
            shifts: [],
            warning:
              "La API no devolvió datos para esta tienda/fecha (posible tienda sin operación en ese día).",
          };
        }
        throw new Error(`Sales fetch failed [${res.status}]: ${body}`);
      }

      const shifts = (await res.json()) as VinsonShift[];
      return { shifts };
    },
  );