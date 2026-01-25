// src/pages/LibraryPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

// Covers fallback (Supabase public storage)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const COVERS_BUCKET = import.meta.env.VITE_COVERS_BUCKET || "covers";

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
}

function supabasePublicUrl(path) {
  if (!SUPABASE_URL || !COVERS_BUCKET || !path) return null;
  const clean = String(path).replace(/^\/+/, "");
  return `${SUPABASE_URL}/storage/v1/object/public/${COVERS_BUCKET}/${clean}`;
}

// ---------- Naming convention helpers ----------
// Accepts "S1", "s1", "S 1" -> "s01"
function seasonTitleToSlug(title) {
  const t = String(title || "").trim().toLowerCase();
  const m = t.match(/^s\s*([0-9]+)$/i) || t.match(/^s([0-9]+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `s${String(n).padStart(2, "0")}`;
}

// Accepts "e1", "E01", "e 2" -> "e01"
function normalizeEpisodeKeyToE(episode_key) {
  const raw = String(episode_key || "").trim().toLowerCase();
  const m = raw.match(/^e\s*([0-9]+)$/i) || raw.match(/^e([0-9]+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `e${String(n).padStart(2, "0")}`;
}

function guessSeasonCoverPath(season_title) {
  const s = seasonTitleToSlug(season_title);
  return s ? `seasons/${s}.jpg` : null;
}

function guessEpisodeCoverPath(season_title, episode_key) {
  const s = seasonTitleToSlug(season_title);
  const e = normalizeEpisodeKeyToE(episode_key);
  return s && e ? `episodes/${s}${e}.jpg` : null;
}

// ---------- UI helpers ----------
function safeUpper(v) {
  const s = String(v || "").trim();
  return s ? s.toUpperCase() : "";
}

function sortEpisodes(list) {
  const arr = [...(list || [])];
  arr.sort((a, b) => {
    // episode_key first (lexicographic is OK if you use e01/e02)
    const ak = String(a.episode_key || "");
    const bk = String(b.episode_key || "");
    if (ak !== bk) return ak.localeCompare(bk);
    // then created_at
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  return arr;
}

export default function LibraryPage() {
  const [status, setStatus] = useState("all"); // all|published|draft
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [summariesById, setSummariesById] = useState({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        const res = await apiGet(`/library-with-summaries?status=${encodeURIComponent(status)}`);
        if (cancelled) return;

        setSeasons(res.seasons || []);
        setEpisodes(res.episodes || []);
        setSummariesById(res.summaries_by_episode_id || {});
      } catch (e) {
        if (cancelled) return;
        setErr(String(e));
        setSeasons([]);
        setEpisodes([]);
        setSummariesById({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const seasonsByKey = useMemo(() => {
    const m = new Map();
    for (const s of seasons || []) m.set(s.season_key, s);
    return m;
  }, [seasons]);

  const episodesBySeason = useMemo(() => {
    const m = new Map();
    for (const e of episodes || []) {
      const key = e.season_key || "__unknown__";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(e);
    }
    // stable ordering for each season
    for (const [k, list] of m.entries()) m.set(k, sortEpisodes(list));
    return m;
  }, [episodes]);

  // --- Covers (DB-first, else naming-convention fallback) ---
  function seasonCoverUrl(s) {
    if (!s) return null;
    if (s.cover_url) return s.cover_url;
    const path = guessSeasonCoverPath(s.title || s.season_key);
    return path ? supabasePublicUrl(path) : null;
  }

  function episodeCoverUrl(e) {
    if (!e) return null;
    if (e.cover_url) return e.cover_url;

    const s = seasonsByKey.get(e.season_key) || null;
    const seasonTitle = s?.title || s?.season_key || e.season_key || "";
    const path = guessEpisodeCoverPath(seasonTitle, e.episode_key);
    return path ? supabasePublicUrl(path) : null;
  }

  // --- Styling (Lovable-like dark) ---
  const page = {
    minHeight: "100vh",
    padding: 20,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    background: "#0b0b0b",
    color: "#e5e7eb",
  };

  const card = {
    border: "1px solid #222",
    borderRadius: 16,
    padding: 14,
    background: "#111",
  };

  const chip = {
    padding: "10px 12px",
    borderRadius: 12,
    background: "#0f0f0f",
    color: "#e5e7eb",
    border: "1px solid #222",
  };

  if (loading) {
    return (
      <div style={page}>
        <h1 style={{ margin: "0 0 10px", fontWeight: 900 }}>Library</h1>
        <div style={{ opacity: 0.75 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 10px", fontWeight: 950, letterSpacing: -0.5 }}>Library</h1>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>status</div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={chip}>
            <option value="all">all</option>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>

          <div style={{ opacity: 0.65, fontSize: 12 }}>
            seasons: <b>{seasons.length}</b> · episodes: <b>{episodes.length}</b>
          </div>
        </div>

        {err && (
          <div style={{ padding: 12, border: "1px solid #b33", borderRadius: 10, marginBottom: 16 }}>
            {err}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
          {(seasons || []).map((s) => {
            const eps = episodesBySeason.get(s.season_key) || [];
            const cover = seasonCoverUrl(s);

            return (
              <div key={s.id} style={card}>
                <div style={{ display: "flex", gap: 14 }}>
                  {cover ? (
                    <img
                      src={cover}
                      alt={s.title || s.season_key}
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 12,
                        objectFit: "cover",
                        border: "1px solid #222",
                        background: "#0f0f0f",
                        flex: "0 0 auto",
                      }}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : (
                    <div
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: 12,
                        border: "1px solid #222",
                        background: "#0f0f0f",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.6,
                        fontSize: 12,
                        flex: "0 0 auto",
                      }}
                    >
                      No cover
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>
                      {s.title || s.season_key}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                      <code>{s.season_key}</code> · {eps.length} épisode(s)
                    </div>

                    {s.description ? (
                      <div style={{ marginTop: 8, opacity: 0.85, lineHeight: 1.35 }}>{s.description}</div>
                    ) : null}

                    <div style={{ marginTop: 10 }}>
                      <Link
                        to={`/season/${encodeURIComponent(s.season_key)}`}
                        style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 800 }}
                      >
                        Open season →
                      </Link>
                    </div>
                  </div>
                </div>

                {eps.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>Episodes</div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {eps.map((e) => {
                        const sum = summariesById?.[e.id] || null;
                        const coverE = episodeCoverUrl(e);

                        return (
                          <div
                            key={e.id}
                            style={{
                              display: "flex",
                              gap: 10,
                              padding: 10,
                              border: "1px solid #222",
                              borderRadius: 12,
                              background: "#0f0f0f",
                              alignItems: "flex-start",
                            }}
                          >
                            {coverE ? (
                              <img
                                src={coverE}
                                alt={e.title || "episode"}
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                  border: "1px solid #222",
                                  background: "#0b0b0b",
                                  flex: "0 0 auto",
                                }}
                                onError={(ev) => (ev.currentTarget.style.display = "none")}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 10,
                                  border: "1px solid #222",
                                  background: "#0b0b0b",
                                  flex: "0 0 auto",
                                }}
                              />
                            )}

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                {safeUpper(e.episode_key) ? `${safeUpper(e.episode_key)} — ` : ""}
                                {e.title || "Untitled"}
                              </div>

                              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>
                                {sum?.summary_short || e.synopsis || "Résumé en cours de génération…"}
                              </div>

                              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <Link
                                  to={`/play/${encodeURIComponent(e.id)}`}
                                  style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 800 }}
                                >
                                  ▶ Play
                                </Link>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!seasons.length && !loading && (
          <div style={{ marginTop: 14, opacity: 0.75 }}>Aucune saison trouvée (ou filtre status trop strict).</div>
        )}

        {!SUPABASE_URL && (
          <div style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
            (Tip) Pour activer le fallback covers via Supabase Storage public, ajoute <code>VITE_SUPABASE_URL</code>.
          </div>
        )}
      </div>
    </div>
  );
}