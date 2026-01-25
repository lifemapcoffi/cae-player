// src/pages/SeasonPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { episodeCoverFallback, seasonCoverFallback } from "../lib/covers.js";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
}

export default function SeasonPage() {
  const { seasonKey } = useParams();

  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [summariesById, setSummariesById] = useState({});

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        // ✅ single call: seasons + episodes + summaries
        const res = await apiGet(`/library-with-summaries?status=all`);
        if (cancelled) return;

        setSeasons(res.seasons || []);

        // filter episodes for this season
        const eps = (res.episodes || []).filter((e) => e.season_key === seasonKey);
        setEpisodes(eps);

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
  }, [seasonKey]);

  const season = useMemo(() => {
    return (seasons || []).find((s) => s.season_key === seasonKey) || null;
  }, [seasons, seasonKey]);

  const seasonTitle = season?.title || seasonKey;

  const seasonCover = useMemo(() => {
    return season?.cover_url || seasonCoverFallback(seasonTitle) || null;
  }, [season?.cover_url, seasonTitle]);

  const uiEpisodes = useMemo(() => {
    return (episodes || []).map((e) => {
      const cover =
        e.cover_url ||
        episodeCoverFallback(seasonTitle, e.episode_key) ||
        seasonCover ||
        null;

      const summary = summariesById?.[e.id] || null;

      // ✅ display priority: summary_short -> synopsis -> empty
      const cardText =
        (summary?.summary_short && String(summary.summary_short).trim()) ||
        (e.synopsis && String(e.synopsis).trim()) ||
        "";

      const summaryPending = !summary?.summary_short && !e.synopsis;

      return {
        ...e,
        ui_cover: cover,
        ui_summary_short: summary?.summary_short || "",
        ui_card_text: summaryPending ? "(summary pending… lance le worker)" : cardText,
        ui_has_summary: !!(summary?.summary_short && String(summary.summary_short).trim()),
        ui_generated_at: summary?.generated_at || null,
      };
    });
  }, [episodes, summariesById, seasonTitle, seasonCover]);

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
      <div style={{ marginBottom: 10 }}>
        <Link to="/" style={{ color: "#93c5fd", textDecoration: "none" }}>
          ← Library
        </Link>
      </div>

      {err && (
        <div style={{ margin: "12px 0", padding: 12, border: "1px solid #b33", borderRadius: 10 }}>
          {err}
        </div>
      )}

      {loading && <div style={{ padding: 12 }}>Loading…</div>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 360, maxWidth: "100%" }}>
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              background: "#111",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {seasonCover ? (
              <img
                src={seasonCover}
                alt={seasonTitle}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              <div style={{ padding: 12, opacity: 0.6, fontSize: 12 }}>No season cover</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ marginTop: 0, marginBottom: 6 }}>{seasonTitle}</h1>
          <div style={{ opacity: 0.7, marginBottom: 16 }}>{season?.description || ""}</div>

          <h2 style={{ margin: "0 0 10px" }}>Episodes</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {uiEpisodes.map((e) => (
              <div
                key={e.id}
                style={{
                  border: "1px solid #222",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "#111",
                }}
              >
                <div style={{ width: "100%", aspectRatio: "16/9", background: "#0f0f0f" }}>
                  {e.ui_cover ? (
                    <img
                      src={e.ui_cover}
                      alt={e.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      onError={(ev) => (ev.currentTarget.style.display = "none")}
                    />
                  ) : (
                    <div style={{ padding: 12, opacity: 0.6, fontSize: 12 }}>No cover</div>
                  )}
                </div>

                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    {e.episode_key ? `${String(e.episode_key).toUpperCase()} — ` : ""}
                    {e.title}
                  </div>

                  {/* ✅ Summary */}
                  <div style={{ opacity: 0.8, fontSize: 13, minHeight: 38, lineHeight: 1.35 }}>
                    {e.ui_card_text}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link
                      to={`/play/${encodeURIComponent(e.id)}`}
                      style={{
                        display: "inline-block",
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#2563eb",
                        color: "white",
                        textDecoration: "none",
                        border: "1px solid #1d4ed8",
                      }}
                    >
                      ▶ Play
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && !uiEpisodes.length && (
            <div style={{ padding: 12, opacity: 0.75 }}>No episodes found for this season.</div>
          )}
        </div>
      </div>
    </div>
  );
}