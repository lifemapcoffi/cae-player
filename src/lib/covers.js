// src/lib/covers.js
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; // ex: https://xxxx.supabase.co
const BUCKET = import.meta.env.VITE_COVERS_BUCKET || "covers";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function seasonTitleToSxx(seasonTitleOrKey) {
  // Accept "S1" -> "s01" / "S01" -> "s01" / "S39-45" -> null (pas convertible)
  const s = String(seasonTitleOrKey || "").trim().toUpperCase();
  const m = s.match(/^S\s*(\d{1,3})$/);
  if (!m) return null;
  return `s${pad2(Number(m[1]))}`;
}

function episodeKeyToExx(episodeKey) {
  // "e1" -> "e01"
  const s = String(episodeKey || "").trim().toLowerCase();
  const m = s.match(/^e(\d{1,3})$/);
  if (!m) return null;
  return `e${pad2(Number(m[1]))}`;
}

export function publicCoverUrl(path) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export function seasonCoverFallback(seasonTitleOrKey) {
  const sxx = seasonTitleToSxx(seasonTitleOrKey);
  if (!sxx) return null;
  return publicCoverUrl(`seasons/${sxx}.jpg`);
}

export function episodeCoverFallback(seasonTitleOrKey, episodeKey) {
  const sxx = seasonTitleToSxx(seasonTitleOrKey);
  const exx = episodeKeyToExx(episodeKey);
  if (!sxx || !exx) return null;
  return publicCoverUrl(`episodes/${sxx}${exx}.jpg`); // ex: s01e01.jpg
}