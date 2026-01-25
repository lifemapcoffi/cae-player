// src/lib/assets.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_PUBLIC_BUCKET = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || "covers";

/**
 * Convertit un path Supabase Storage ("season/S39-45.jpg")
 * en URL publique : {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 *
 * - si url est déjà http(s) => retourne tel quel
 * - si vide/null => ""
 */
export function resolvePublicAssetUrl(urlOrPath?: string | null): string {
  const v = (urlOrPath || "").trim();
  if (!v) return "";

  // Already absolute URL
  if (/^https?:\/\//i.test(v)) return v;

  // If no supabase url configured, return raw (dev fallback)
  if (!SUPABASE_URL) return v;

  // normalize leading slash
  const path = v.startsWith("/") ? v.slice(1) : v;

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_PUBLIC_BUCKET}/${path}`;
}