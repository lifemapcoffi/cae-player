// src/pages/PlayerPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const DEFAULT_PROFILE_ID = import.meta.env.VITE_PROFILE_ID || "";

// Covers fallback (Supabase Storage public bucket)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const COVERS_BUCKET = import.meta.env.VITE_COVERS_BUCKET || "covers";

function b64ToBlobUrl(b64, mime = "audio/mpeg") {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
}

async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
}

function roleKeyToSpeakerId(roleKey) {
  const rk = String(roleKey || "").toLowerCase().trim();
  if (rk === "civil") return "civil";
  if (rk === "leader") return "leader";
  if (rk === "correspondent") return "correspondent";
  if (rk === "narrator") return "narrator";
  if (rk.includes("civil")) return "civil";
  if (rk.includes("leader") || rk.includes("dirigeant") || rk.includes("polit")) return "leader";
  if (rk.includes("correspond") || rk.includes("journal")) return "correspondent";
  if (rk.includes("narrat")) return "narrator";
  return "narrator";
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

function guessEpisodeCoverPath({ season_title, episode_key }) {
  const s = seasonTitleToSlug(season_title);
  const e = normalizeEpisodeKeyToE(episode_key);
  if (!s || !e) return null;
  return `episodes/${s}${e}.jpg`;
}
function guessSeasonCoverPath({ season_title }) {
  const s = seasonTitleToSlug(season_title);
  if (!s) return null;
  return `seasons/${s}.jpg`;
}

export default function PlayerPage() {
  const { episodeId } = useParams();
  const audioRef = useRef(null);

  const [episode, setEpisode] = useState(null);
  const [season, setSeason] = useState(null);

  const [segments, setSegments] = useState([]);
  const [idx, setIdx] = useState(0);

  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);

  const [suggestions, setSuggestions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [busyAudio, setBusyAudio] = useState(false);
  const [busyAsk, setBusyAsk] = useState(false);
  const [err, setErr] = useState("");

  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [answerAccepted, setAnswerAccepted] = useState(null);

  const [autoNext, setAutoNext] = useState(true);

  // Toast
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef(null);
  function showToast(msg, ms = 1400) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), ms);
  }
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const current = segments[idx] || null;

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) || null,
    [profiles, profileId]
  );

  const pageTitle = useMemo(() => {
    if (episode?.title) return `CAE — ${episode.title}`;
    if (current?.canon_cursor) return `CAE — ${current.canon_cursor}`;
    return "CAE Player";
  }, [episode?.title, current?.canon_cursor]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  function stopAudio() {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
      audioRef.current.src = "";
    }
  }

  async function playBase64Audio(audioObj) {
    stopAudio();
    if (!audioRef.current) return;
    const url = b64ToBlobUrl(audioObj.audio_base64, audioObj.mime || "audio/mpeg");
    audioRef.current.src = url;
    await audioRef.current.play();
  }

  // ---- Load everything when episodeId changes ----
  useEffect(() => {
    if (!episodeId) {
      setErr("Missing episodeId in URL");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        stopAudio();
        setAskOpen(false);
        setQuestion("");
        setAnswerText("");
        setAnswerAccepted(null);

        setEpisode(null);
        setSeason(null);
        setSegments([]);
        setIdx(0);
        setProfiles([]);
        setProfileId(DEFAULT_PROFILE_ID);
        setSuggestions([]);

        const epRes = await apiGet(`/episode?episode_id=${encodeURIComponent(episodeId)}`);
        const ep = epRes.episode || null;
        if (cancelled) return;
        setEpisode(ep);

        if (ep?.season_key) {
          try {
            const sRes = await apiGet(`/season?season_key=${encodeURIComponent(ep.season_key)}&status=all`);
            if (!cancelled) setSeason(sRes.season || null);
          } catch {
            if (!cancelled) setSeason(null);
          }
        }

        const segRes = await apiGet(`/segments?episode_id=${encodeURIComponent(episodeId)}`);
        const segs = segRes.segments || [];
        if (cancelled) return;
        setSegments(segs);
        setIdx(0);

        const profRes = await apiGet(`/profiles?episode_id=${encodeURIComponent(episodeId)}`);
        const profsRaw = profRes.profiles || [];
        const profs = (profsRaw || []).map((p) => ({
          id: p.id,
          label: p.label || p.name || p.id,
          role_key: p.role_key || null,
        }));
        if (cancelled) return;
        setProfiles(profs);

        const envOk = DEFAULT_PROFILE_ID && profs.some((p) => p.id === DEFAULT_PROFILE_ID);
        if (envOk) setProfileId(DEFAULT_PROFILE_ID);
        else if (profs.length) setProfileId((prev) => (profs.some((p) => p.id === prev) ? prev : profs[0].id));
        else setProfileId("");
      } catch (e) {
        if (cancelled) return;
        setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  // Suggestions for current segment
  useEffect(() => {
    if (!episodeId || !current?.canon_cursor) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiGet(
          `/suggestions?episode_id=${encodeURIComponent(episodeId)}&canon_cursor=${encodeURIComponent(
            current.canon_cursor
          )}`
        );
        if (cancelled) return;
        setSuggestions(res.suggestions || []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [episodeId, current?.canon_cursor]);

  // Covers
  const episodeCoverUrl = useMemo(() => {
    if (!episode) return null;
    if (episode.cover_url) return episode.cover_url;
    const season_title = season?.title || season?.season_key || "";
    const path = guessEpisodeCoverPath({ season_title, episode_key: episode.episode_key });
    return path ? supabasePublicUrl(path) : null;
  }, [episode, season?.title, season?.season_key]);

  const seasonCoverUrl = useMemo(() => {
    if (!season) return null;
    if (season.cover_url) return season.cover_url;
    const path = guessSeasonCoverPath({ season_title: season.title || season.season_key });
    return path ? supabasePublicUrl(path) : null;
  }, [season]);

  // ---- Controls ----
  function onPrev() {
    stopAudio();
    setAnswerText("");
    setAnswerAccepted(null);
    setIdx((v) => Math.max(0, v - 1));
  }
  function onNext() {
    stopAudio();
    setAnswerText("");
    setAnswerAccepted(null);
    setIdx((v) => Math.min(Math.max(0, segments.length - 1), v + 1));
  }

  async function onPlayNarration() {
    try {
      setErr("");
      if (!current) return;
      setBusyAudio(true);

      const res = await apiPost("/tts", {
        text: current.segment_text,
        speaker_id: current.speaker_id,
      });

      await playBase64Audio(res.audio);
    } catch (e) {
      setErr(`Narration failed: ${String(e)}`);
    } finally {
      setBusyAudio(false);
    }
  }

  async function runAsk(qText) {
    if (!episodeId || !current) return;
    const q = String(qText || "").trim();
    if (!q) return;
    if (!profileId) throw new Error("No profile selected");

    setQuestion(q);
    setAnswerText("");
    setAnswerAccepted(null);

    const res = await apiPost("/ask", {
      episode_id: episodeId,
      canon_cursor: current.canon_cursor,
      profile_id: profileId,
      question: q,
      response_format: { audio: true },
    });

    setAnswerText(res.answer_text || "");
    setAnswerAccepted(res.accepted);

    if (res.answer_audio && res.answer_audio.audio_base64) {
      await playBase64Audio(res.answer_audio);
      return;
    }

    if (res.answer_text) {
      const speaker_id = roleKeyToSpeakerId(selectedProfile?.role_key);
      const tts = await apiPost("/tts", { text: res.answer_text, speaker_id });
      await playBase64Audio(tts.audio);
    }
  }

  async function onAskSubmit() {
    try {
      setErr("");
      setBusyAsk(true);
      showToast("Question envoyée");
      await runAsk(question);
    } catch (e) {
      setErr(`Ask failed: ${String(e)}`);
    } finally {
      setBusyAsk(false);
    }
  }

  async function onAskFromSuggestion(s) {
    // ✅ requirement: open drawer but still send directly
    setAskOpen(true);
    try {
      setErr("");
      setBusyAsk(true);
      showToast("Question envoyée");
      await runAsk(s);
    } catch (e) {
      setErr(`Ask failed: ${String(e)}`);
    } finally {
      setBusyAsk(false);
    }
  }

  // Auto-next when audio ends
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    function onEnded() {
      if (!autoNext) return;
      setIdx((v) => Math.min(Math.max(0, segments.length - 1), v + 1));
    }

    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [autoNext, segments.length]);

  const canAskSubmit = !!question.trim() && !!profileId && !!current && !busyAsk;

  // ---- UI styles ----
  const styles = {
    page: {
      minHeight: "100vh",
      padding: 16,
      paddingBottom: 110,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      background: "#0b0b0b",
      color: "#e5e7eb",
    },
    card: {
      border: "1px solid #222",
      borderRadius: 16,
      background: "#0f0f0f",
      padding: 12,
    },
    btn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #374151",
      background: "#111827",
      color: "#e5e7eb",
      cursor: "pointer",
    },
    btnPrimary: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #1d4ed8",
      background: "#2563eb",
      color: "white",
      cursor: "pointer",
    },
    chip: {
      fontSize: 12,
      padding: "8px 10px",
      borderRadius: 999,
      border: "1px solid #374151",
      background: "#111827",
      color: "#e5e7eb",
      cursor: "pointer",
      textAlign: "left",
    },
    sticky: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(11,11,11,0.92)",
      borderTop: "1px solid #222",
      padding: 12,
      backdropFilter: "blur(8px)",
      zIndex: 20,
    },
    input: {
      width: "100%",
      padding: 10,
      borderRadius: 12,
      background: "#0f0f0f",
      color: "#e5e7eb",
      border: "1px solid #222",
    },
    toast: {
      position: "fixed",
      top: 14,
      right: 14,
      zIndex: 50,
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #1f2937",
      background: "rgba(17,24,39,0.92)",
      color: "#e5e7eb",
      fontSize: 12,
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      backdropFilter: "blur(8px)",
    },
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ opacity: 0.8 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {toast ? <div style={styles.toast}>{toast}</div> : null}

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div>
          <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 6 }}>
            <Link to="/" style={{ color: "#93c5fd", textDecoration: "none" }}>
              ← Library
            </Link>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{episode?.title || "CAE Player"}</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            <code>{episodeId}</code>
            {episode?.episode_key ? (
              <>
                {" · "}
                <code>{String(episode.episode_key).toUpperCase()}</code>
              </>
            ) : null}
            {season?.title ? (
              <>
                {" · "}
                <span>{season.title}</span>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Auto-next</label>
          <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #b33", borderRadius: 14 }}>
          {err}
        </div>
      )}

      {/* Episode header */}
      {(episodeCoverUrl || seasonCoverUrl || episode?.synopsis) && (
        <div style={{ ...styles.card, marginTop: 12, display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          {(episodeCoverUrl || seasonCoverUrl) && (
            <img
              src={episodeCoverUrl || seasonCoverUrl}
              alt="cover"
              style={{ width: 140, height: 140, borderRadius: 14, objectFit: "cover", border: "1px solid #222" }}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}

          <div style={{ flex: 1, minWidth: 240 }}>
            {episode?.synopsis ? (
              <div style={{ whiteSpace: "pre-wrap", opacity: 0.9, lineHeight: 1.35 }}>{episode.synopsis}</div>
            ) : null}
          </div>
        </div>
      )}

      {/* Now playing */}
      <div style={{ ...styles.card, marginTop: 12 }}>
        {!current ? (
          <div style={{ opacity: 0.8 }}>No segments loaded.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ opacity: 0.9 }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Now playing</div>
                <div style={{ fontWeight: 900 }}>
                  Segment {idx + 1} / {segments.length}
                </div>
              </div>

              <div style={{ opacity: 0.8, fontSize: 12, textAlign: "right" }}>
                <div>
                  cursor: <code>{current.canon_cursor}</code>
                </div>
                <div>
                  speaker: <code>{current.speaker_id}</code>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.4, opacity: 0.95 }}>
              {current.segment_text}
            </div>
          </>
        )}
      </div>

      {/* Suggestions (click => open drawer + direct ask) */}
      {suggestions?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Suggestions</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, opacity: busyAsk ? 0.65 : 1 }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                style={styles.chip}
                onClick={() => onAskFromSuggestion(s)}
                disabled={!current || busyAsk}
                title={busyAsk ? "Asking…" : "Send this question now"}
              >
                {s}
              </button>
            ))}
          </div>
          {busyAsk && <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>Asking…</div>}
        </div>
      )}

      {/* Ask Drawer */}
      {askOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            padding: 12,
            zIndex: 40,
          }}
          onClick={() => setAskOpen(false)}
        >
          <div
            style={{
              width: "min(900px, 100%)",
              background: "#0b0b0b",
              border: "1px solid #222",
              borderRadius: 18,
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              maxHeight: "72vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid #1f2937",
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 900 }}>Ask</div>
              <button style={styles.btn} onClick={() => setAskOpen(false)}>
                Close
              </button>
            </div>

            {/* Drawer body (scrollable) */}
            <div style={{ padding: 12, overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontWeight: 800, opacity: 0.9 }}>Profile</label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    minWidth: 240,
                    background: "#0f0f0f",
                    color: "#e5e7eb",
                    border: "1px solid #222",
                  }}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} {p.role_key ? `(${p.role_key})` : ""}
                    </option>
                  ))}
                </select>
                {!profiles.length && <div style={{ opacity: 0.7, fontSize: 12 }}>Aucun profil</div>}
              </div>

              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="Écris ta question…"
                style={{ ...styles.input, marginTop: 10 }}
              />

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={styles.btnPrimary} onClick={onAskSubmit} disabled={!canAskSubmit}>
                  {busyAsk ? "Asking…" : "Ask (audio)"}
                </button>
                <button
                  style={styles.btn}
                  onClick={() => {
                    setQuestion("");
                    setAnswerText("");
                    setAnswerAccepted(null);
                  }}
                  disabled={busyAsk}
                >
                  Clear
                </button>
              </div>

              {/* ✅ Answer ALWAYS visible (not masked), in scrollable body */}
              <div style={{ ...styles.card, marginTop: 12 }}>
                <div style={{ opacity: 0.85, marginBottom: 6 }}>
                  <b>Answer</b>{" "}
                  {answerAccepted === true ? "(accepted)" : answerAccepted === false ? "(fallback mini-gate)" : ""}
                </div>

                {answerText ? (
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{answerText}</div>
                ) : (
                  <div style={{ opacity: 0.65, fontSize: 13 }}>
                    (Pas encore de réponse — clique une suggestion ou envoie une question)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom bar */}
      <div style={styles.sticky}>
        <div style={{ width: "min(980px, 100%)", margin: "0 auto" }}>
          <audio ref={audioRef} controls style={{ width: "100%" }} />

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={styles.btn} onClick={onPrev} disabled={idx === 0 || busyAudio}>
                ◀ Prev
              </button>
              <button style={styles.btn} onClick={onNext} disabled={idx >= segments.length - 1 || busyAudio}>
                Next ▶
              </button>
              <button style={styles.btnPrimary} onClick={onPlayNarration} disabled={!current || busyAudio}>
                {busyAudio ? "Loading…" : "▶ Play narration"}
              </button>
              <button style={styles.btn} onClick={stopAudio}>
                ⏸ Stop
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={styles.btn} onClick={() => setAskOpen(true)} disabled={!current} title="Ask a custom question">
                ✨ Ask
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}