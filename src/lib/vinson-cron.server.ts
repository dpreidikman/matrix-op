import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE = "https://apireportes.vinson.com.ar";
const STORES = [643, 695, 73, 363];

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
  if (!res.ok) throw new Error(`Login failed [${res.status}]`);
  const json = (await res.json()) as { token: string };
  let exp = now + 3600;
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

async function fetchDay(storeId: number, dateIso: string) {
  const url = `${BASE}/api/Sales/GetSalesPerStorePerShift/${storeId}/${dateIso.replace(/-/g, "")}`;
  const doFetch = async () => {
    const token = await getToken();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    try {
      return await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };
  let res = await doFetch();
  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    res = await doFetch();
  }
  if (!res.ok) return null;
  return (await res.json()) as { sale: string; date: string; shift: string }[];
}

export async function runVinsonDailyCron() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const dateIso = `${y}-${m}-${day}`;

  const results: { storeId: number; date: string; ok: boolean; total?: number }[] = [];
  for (const storeId of STORES) {
    try {
      const shifts = await fetchDay(storeId, dateIso);
      if (!shifts) {
        results.push({ storeId, date: dateIso, ok: false });
        continue;
      }
      const total = shifts.reduce((a, s) => a + Number(s.sale ?? 0), 0);
      const { error } = await supabaseAdmin
        .from("vinson_daily_sales")
        .upsert(
          { store_id: storeId, date: dateIso, total, shifts, updated_at: new Date().toISOString() },
          { onConflict: "store_id,date" },
        );
      if (error) throw error;
      results.push({ storeId, date: dateIso, ok: true, total });
    } catch (e) {
      console.warn("[vinson-cron] failed", storeId, dateIso, (e as Error)?.message);
      results.push({ storeId, date: dateIso, ok: false });
    }
  }
  return { date: dateIso, results };
}