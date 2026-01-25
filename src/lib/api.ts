// src/lib/api.ts

/**
 * API_BASE strategy (premium tunnel-friendly):
 * - If VITE_API_BASE is set:
 *    - can be absolute ("http://localhost:3000") OR relative ("/api")
 * - Else:
 *    - on localhost -> default to "http://localhost:3000" (dev comfort)
 *    - otherwise -> default to "/api" (same-origin, works with Cloudflare tunnel + Vite proxy)
 */
const ENV_BASE = (import.meta.env.VITE_API_BASE || "").trim();

const API_BASE =
  ENV_BASE ||
  (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    ? "http://localhost:3000"
    : "/api");

type ApiEnvelope = { ok?: boolean; error?: string };

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function buildUrl(endpoint: string) {
  const base = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // If base is absolute: new URL(base + path) works
  // If base is relative ("/api"): must use window.location.origin as base for URL()
  if (/^https?:\/\//i.test(base)) {
    return new URL(`${base}${path}`);
  }
  return new URL(`${base}${path}`, window.location.origin);
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(input, init);
  } catch (e: any) {
    const msg =
      e?.message ||
      "Network error. Check that the backend is running and VITE_API_BASE is correct.";
    throw new Error(msg);
  }

  const json = (await parseJsonSafe(res)) as ApiEnvelope & Record<string, any>;

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `${res.status} ${res.statusText || ""}`.trim());
  }

  return json as T;
}

export const api = {
  get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined | null>,
    init?: RequestInit
  ) {
    const url = buildUrl(endpoint);

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        url.searchParams.set(k, String(v));
      });
    }

    return request<T>(url.toString(), init);
  },

  post<T>(endpoint: string, data?: unknown, init?: RequestInit) {
    const headers = new Headers(init?.headers);

    if (data !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const url = buildUrl(endpoint);

    return request<T>(url.toString(), {
      method: "POST",
      ...init,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  },
};