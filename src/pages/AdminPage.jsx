// src/pages/AdminPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

// Optional admin token (if you set ADMIN_TOKEN on backend)
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || "";

// Covers fallback (optional, if you already use these in Library/Player)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const COVERS_BUCKET = import.meta.env.VITE_COVERS_BUCKET || "covers";

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
}

async function apiPost(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (ADMIN_TOKEN) headers["x-admin-token"] = ADMIN_TOKEN;

  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
}

function supabasePublicUrl(path) {
  if (!SUPABASE_URL || !COVERS_BUCKET || !path) return null;
  const clean = String(path).replace(/^\/+/, "");
  return `${SUPABASE_URL}/storage/v1/object/public/${COVERS_BUCKET}/${clean}`;
}

// "S1" -> "s01"
function seasonTitleToSlug(title) {
  const t = String(title || "").trim().toLowerCase();
  const m = t.match(/^s\s*([0-9]+)$/i) || t.match(/^s([0-9]+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return `s${String(n).padStart(2, "0")}`;
}

function normalizeEpisodeKeyToE(episode_key) {
  const raw = String(episode_key || "").trim().toLowerCase();
  const m = raw.match(/^e\s*([0-9]+)$/i) || raw.match(/^e([0-9]+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return `e${String(n).padStart(2, "0")}`;
}

function guessSeasonCoverPath({ season_title }) {
  const s = seasonTitleToSlug(season_title);
  if (!s) return null;
  return `seasons/${s}.jpg`;
}

function guessEpisodeCoverPath({ season_title, episode_key }) {
  const s = seasonTitleToSlug(season_title);
  const e = normalizeEpisodeKeyToE(episode_key);
  if (!s || !e) return null;
  return `episodes/${s}${e}.jpg`;
}

export default function AdminPage() {
  const [status, setStatus] = useState("all"); // keep "all" for admin ops
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [summariesById, setSummariesById] = useState({});

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiGet(`/library-with-summaries?status=${encodeURIComponent(status)}`);
      setSeasons(res.seasons || []);
      setEpisodes(res.episodes || []);
      setSummariesById(res.summaries_by_episode_id || {});
    } catch (e) {
      setErr(String(e));
      setSeasons([]);
      setEpisodes([]);
      setSummariesById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const seasonsByKey = useMemo(() => {
    const m = new Map();
    for (const s of seasons) m.set(s.season_key, s);
    return m;
  }, [seasons]);

  const episodesBySeason = useMemo(() => {
    const m = new Map();
    for (const e of episodes) {
      const k = e.season_key || "unknown";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    // stable ordering: episode_key then created_at
    for (const [k, list] of m) {
      list.sort((a, b) => {
        const ak = String(a.episode_key || "");
        const bk = String(b.episode_key || "");
        if (ak !== bk) return ak.localeCompare(bk);
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
      m.set(k, list);
    }
    return m;
  }, [episodes]);

  function seasonCoverUrl(s) {
    if (!s) return null;
    if (s.cover_url) return s.cover_url;
    const path = guessSeasonCoverPath({ season_title: s.title || s.season_key });
    return path ? supabasePublicUrl(path) : null;
  }

  function episodeCoverUrl(e) {
    if (!e) return null;
    if (e.cover_url) return e.cover_url;
    const s = seasonsByKey.get(e.season_key) || null;
    const seasonTitle = s?.title || s?.season_key || e.season_key;
    const path = guessEpisodeCoverPath({ season_title: seasonTitle, episode_key: e.episode_key });
    return path ? supabasePublicUrl(path) : null;
  }

  async function setEpisodeStatus(episode_id, nextStatus) {
    setBusy(true);
    setErr("");
    try {
      await apiPost("/admin/episode/publish", { episode_id, status: nextStatus });
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateSummary(episode_id) {
    setBusy(true);
    setErr("");
    try {
      await apiPost("/admin/episode/summary/regenerate", { episode_id });
      // Don’t wait; just refresh soon
      setTimeout(() => {
        load();
      }, 1500);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const uiSeasons = useMemo(() => {
    // Ensure seasons with no episodes still appear (admin wants full view)
    const keys = new Set(seasons.map((s) => s.season_key));
    for (const e of episodes) if (e.season_key) keys.add(e.season_key);

    const list = Array.from(keys).map((k) => seasonsByKey.get(k) || { id: k, season_key: k, title: k });
    list.sort((a, b) => String(a.title || a.season_key).localeCompare(String(b.title || b.season_key)));
    return list;
  }, [seasons, episodes, seasonsByKey]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 20,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        background: "#0b0b0b",
        color: "#e5e7eb",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ marginBottom: 10 }}>
            <Link to="/" style={{ color: "#93c5fd", textDecoration: "none" }}>
              ← Library
            </Link>
          </div>
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            Ops: publish/draft · regenerate summaries · check covers
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>status</div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="all">all</option>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>

          <button
            onClick={load}
            disabled={loading || busy}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #374151",
              background: "#111827",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {ADMIN_TOKEN ? (
        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          Auth: <code>VITE_ADMIN_TOKEN</code> enabled
        </div>
      ) : (
        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          Auth: <i>disabled</i> (optional)
        </div>
      )}

      {err && (
        <div style={{ margin: "14px 0", padding: 12, border: "1px solid #b33", borderRadius: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 14 }}>Loading…</div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          {uiSeasons.map((s) => {
            const seasonKey = s.season_key || "unknown";
            const eps = episodesBySeason.get(seasonKey) || [];
            const cov = seasonCoverUrl(s);

            return (
              <div
                key={s.id || seasonKey}
                style={{
                  border: "1px solid #222",
                  borderRadius: 16,
                  background: "#0f0f0f",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 14, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ width: 220, maxWidth: "100%" }}>
                    <div style={{ width: "100%", aspectRatio: "16/9", background: "#111", borderRadius: 14, overflow: "hidden" }}>
                      {cov ? (
                        <img
                          src={cov}
                          alt={s.title || seasonKey}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      ) : (
                        <div style={{ padding: 12, opacity: 0.6, fontSize: 12 }}>No season cover</div>
                      )}
                    </div>

                    <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                      season_key: <code>{seasonKey}</code>
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {s.title || seasonKey}
                    </div>
                    {s.description ? <div style={{ marginTop: 6, opacity: 0.75 }}>{s.description}</div> : null}

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link
                        to={`/season/${encodeURIComponent(seasonKey)}`}
                        style={{ color: "#93c5fd", textDecoration: "none" }}
                      >
                        Open season →
                      </Link>
                    </div>

                    <div style={{ marginTop: 14, opacity: 0.8, fontWeight: 800 }}>Episodes ({eps.length})</div>

                    {eps.length === 0 ? (
                      <div style={{ padding: "10px 0", opacity: 0.6, fontSize: 12 }}>No episodes in this season.</div>
                    ) : (
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        {eps.map((e) => {
                          const sum = summariesById?.[e.id] || null;
                          const covE = episodeCoverUrl(e);

                          const st = String(e.status || "draft").toLowerCase();
                          const hasSummary = !!(sum && (sum.summary_short || sum.summary_long));

                          return (
                            <div
                              key={e.id}
                              style={{
                                border: "1px solid #222",
                                borderRadius: 14,
                                padding: 12,
                                background: "#0b0b0b",
                                display: "flex",
                                gap: 12,
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minWidth: 260 }}>
                                {covE ? (
                                  <img
                                    src={covE}
                                    alt="ep cover"
                                    style={{ width: 84, height: 84, borderRadius: 12, objectFit: "cover", border: "1px solid #222" }}
                                    onError={(ev) => (ev.currentTarget.style.display = "none")}
                                  />
                                ) : (
                                  <div style={{ width: 84, height: 84, borderRadius: 12, background: "#111", border: "1px solid #222" }} />
                                )}

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                                    {e.episode_key ? `${String(e.episode_key).toUpperCase()} — ` : ""}
                                    {e.title || "Untitled"}
                                  </div>

                                  <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>
                                    id: <code>{e.id}</code>
                                  </div>

                                  <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <span
                                      style={{
                                        fontSize: 12,
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #374151",
                                        background: st === "published" ? "#052e16" : "#111827",
                                      }}
                                    >
                                      {st}
                                    </span>

                                    <span
                                      style={{
                                        fontSize: 12,
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #374151",
                                        background: hasSummary ? "#1e3a8a" : "#3f1d1d",
                                      }}
                                    >
                                      {hasSummary ? "summary ✅" : "summary ❌"}
                                    </span>

                                    <Link to={`/play/${encodeURIComponent(e.id)}`} style={{ color: "#93c5fd", textDecoration: "none" }}>
                                      Open player →
                                    </Link>
                                  </div>

                                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>
                                    {hasSummary
                                      ? (sum.summary_short || "").slice(0, 220)
                                      : e.synopsis
                                      ? e.synopsis
                                      : "(no synopsis / summary yet)"}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {st === "published" ? (
                                  <button
                                    disabled={busy}
                                    onClick={() => setEpisodeStatus(e.id, "draft")}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: 12,
                                      border: "1px solid #7f1d1d",
                                      background: "#450a0a",
                                      color: "#fff",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Set draft
                                  </button>
                                ) : (
                                  <button
                                    disabled={busy}
                                    onClick={() => setEpisodeStatus(e.id, "published")}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: 12,
                                      border: "1px solid #14532d",
                                      background: "#052e16",
                                      color: "#fff",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Publish
                                  </button>
                                )}

                                <button
                                  disabled={busy}
                                  onClick={() => regenerateSummary(e.id)}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid #374151",
                                    background: "#111827",
                                    color: "#e5e7eb",
                                    cursor: "pointer",
                                  }}
                                  title="Launch worker_episode_summary.js for this episode"
                                >
                                  {hasSummary ? "Regenerate summary" : "Generate summary"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
        Tip covers: Storage public bucket <code>{COVERS_BUCKET}</code> · <code>seasons/s01.jpg</code> · <code>episodes/s01e01.jpg</code>
      </div>
    </div>
  );
}