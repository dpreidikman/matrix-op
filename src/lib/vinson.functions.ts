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
  .handler(async ({ data }): Promise<{ shifts: VinsonShift[] }> => {
    const token = await getToken();
    const url = `${BASE}/api/Sales/GetSalesPerStorePerShift/${data.idTienda}/${toApiDate(data.date)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      // Token might have been invalidated; retry once with a fresh token.
      cachedToken = null;
      const t2 = await getToken();
      const r2 = await fetch(url, { headers: { Authorization: `Bearer ${t2}` } });
      if (!r2.ok) throw new Error(`Sales fetch failed [${r2.status}]: ${await r2.text()}`);
      const shifts = (await r2.json()) as VinsonShift[];
      return { shifts };
    }
    const shifts = (await res.json()) as VinsonShift[];
    return { shifts };
  });