// src/lovable/PlayerView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Music, Volume2 } from "lucide-react";
import { CircularCover } from "@/components/CircularCover";
import { ProgressRing } from "@/components/ProgressRing";
import { OrbAnimation } from "@/components/OrbAnimation";
import { AudioControls } from "@/components/AudioControls";
import { SuggestionChips } from "@/components/SuggestionChips";
import SuggestionOrbit from "@/components/SuggestionOrbit";
import { AIResponseDrawer } from "@/components/AIResponseDrawer";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/assets";
import { MicIcon } from "@/components/icons/MicIcon";

const SKIN_BASE = "/skins/lovable-v1";

type Episode = {
  id: string;
  title?: string | null;
  synopsis?: string | null;
  season_key?: string | null;
  episode_key?: string | null;
  cover_url?: string | null;

  // BGM
  bgm_url?: string | null;
  bgm_loop?: boolean | null;
  bgm_volume?: number | null;
};

type Season = {
  season_key: string;
  title?: string | null;
  cover_url?: string | null;
};

type Segment = {
  canon_cursor: string;
  segment_text: string;
  speaker_id: string;
  start_ms?: number;
  end_ms?: number;

  // optional SFX
  sfx_url?: string | null;
  sfx_at_ms?: number | null; // ms after segment start (best-effort)
  sfx_volume?: number | null;
};

type Profile = {
  id: string;
  label?: string | null;
  name?: string | null;
  role_key?: string | null;
};

type MicState = "idle" | "speaking" | "listening";

type AudioPayload = { audio_base64: string; mime?: string };

function b64ToBlobUrl(b64: string, mime = "audio/mpeg") {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function safeNumber(n: any, fallback: number) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

type ContinueListening = {
  episode_id: string;
  episode_title?: string;
  season_key?: string;
  season_title?: string;
  cover_url?: string;

  // reprise fine
  segment_index?: number;
  canon_cursor?: string;

  updated_at: number;
};

function saveContinueListening(payload: ContinueListening) {
  try {
    localStorage.setItem("lm_continueListening", JSON.stringify(payload));
  } catch {}
}

const FADE_STEP_MS = 25;

export default function PlayerView() {
  const navigate = useNavigate();
  const { episodeId } = useParams<{ episodeId: string }>();

  const [micState, setMicState] = useState<MicState>("idle");

  // Narration audio player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // BGM + SFX players
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const sfxTimerRef = useRef<number | null>(null);

  // fades/ducking
  const bgmFadeTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [season, setSeason] = useState<Season | null>(null);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [idx, setIdx] = useState(0);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string>("");

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busyAsk, setBusyAsk] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");

  // Drawer "ask" mode (free text question)
  const [drawerMode, setDrawerMode] = useState<"read" | "ask">("read");
  const [draftQuestion, setDraftQuestion] = useState("");

  // Narration state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [narrationMode, setNarrationMode] = useState<"audio" | "text">("audio");

  // Karaoke reveal (text mode)
  const [textStartedAt, setTextStartedAt] = useState<number | null>(null);
  const [textVisibleChars, setTextVisibleChars] = useState(0);

  // gate display
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);

  // Toggles (persisted)
  const [musicEnabled, setMusicEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("lm_musicEnabled");
    return v === null ? true : v === "true";
  });
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("lm_sfxEnabled");
    return v === null ? true : v === "true";
  });

  // Autoplay toggle (persisted)
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("lm_autoplayEnabled");
    return v === null ? true : v === "true";
  });

  const current = segments[idx] || null;

  const coverUrl = resolvePublicAssetUrl(episode?.cover_url || season?.cover_url || "");
  const seasonTitle = (season?.title || `Saison ${episode?.season_key || ""}` || "").toString();
  const episodeTitle = (episode?.title || "Épisode").toString();

  // ✅ Continue Listening writer (Library + Season will read it)
  useEffect(() => {
    if (!episodeId) return;

    const payload: ContinueListening = {
      episode_id: episodeId,
      episode_title: episodeTitle || undefined,
      season_key: (episode?.season_key || season?.season_key || undefined) as string | undefined,
      season_title: seasonTitle || undefined,
      cover_url: (episode?.cover_url || season?.cover_url || undefined) as string | undefined,
      segment_index: idx,
      canon_cursor: current?.canon_cursor,
      updated_at: Date.now(),
    };

    saveContinueListening(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    episodeId,
    episodeTitle,
    seasonTitle,
    episode?.season_key,
    season?.season_key,
    episode?.cover_url,
    season?.cover_url,
    idx,
    current?.canon_cursor,
  ]);

  // BGM config
  const bgmUrl = useMemo(() => resolvePublicAssetUrl(episode?.bgm_url || ""), [episode?.bgm_url]);
  const bgmLoop = Boolean(episode?.bgm_loop ?? true);
  const bgmVolume = useMemo(() => {
    const v = safeNumber(episode?.bgm_volume, 0.25);
    return Math.max(0, Math.min(1, v));
  }, [episode?.bgm_volume]);

  // Progress ring
  const progress = useMemo(() => {
    if (narrationMode === "audio") {
      if (!duration || duration <= 0) return 0;
      return Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100)));
    }
    // text mode: smoother progression based on revealed chars (when started)
    const text = current?.segment_text || "";
    if (!text.length) return 0;
    const p = Math.round((textVisibleChars / text.length) * 100);
    return Math.max(0, Math.min(100, p));
  }, [narrationMode, duration, currentTime, current?.segment_text, textVisibleChars]);

  // -------------------------
  // Cleanup helpers
  // -------------------------
  function cleanupObjectUrl() {
    if (audioUrlRef.current) {
      try {
        URL.revokeObjectURL(audioUrlRef.current);
      } catch {}
      audioUrlRef.current = null;
    }
  }

  function stopSfxTimer() {
    if (sfxTimerRef.current) {
      window.clearTimeout(sfxTimerRef.current);
      sfxTimerRef.current = null;
    }
  }

  function stopSfxNow() {
    const sfx = sfxRef.current;
    if (!sfx) return;
    try {
      sfx.pause();
      sfx.currentTime = 0;
    } catch {}
    sfx.removeAttribute("src");
  }

  function clearBgmFade() {
    if (bgmFadeTimerRef.current) {
      window.clearInterval(bgmFadeTimerRef.current);
      bgmFadeTimerRef.current = null;
    }
  }

  function resetNarrationAudioState() {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }

  function stopNarrationAudio() {
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {}
      a.src = "";
    }
    cleanupObjectUrl();
    resetNarrationAudioState();
  }

  function pauseBgmHard() {
    const bgm = bgmRef.current;
    if (!bgm) return;
    try {
      bgm.pause();
    } catch {}
  }

  function stopTextPlayback() {
    setTextStartedAt(null);
    // keep textVisibleChars for resume
  }

  function pauseAllPlayback() {
    // narration audio
    const a = audioRef.current;
    if (a && !a.paused) {
      try {
        a.pause();
      } catch {}
    }

    // text mode
    stopTextPlayback();

    // bgm fade out + pause
    bgmFadeOutAndPause();

    // sfx
    stopSfxTimer();
    stopSfxNow();

    setIsPlaying(false);
  }

  function stopAllPlayback() {
    stopNarrationAudio();
    bgmFadeOutAndPause(true);
    stopSfxTimer();
    stopSfxNow();

    setTextStartedAt(null);
    setTextVisibleChars(0);

    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
  }

  async function playBase64Audio(audio: AudioPayload) {
    stopNarrationAudio();
    const a = audioRef.current;
    if (!a) return;

    const url = b64ToBlobUrl(audio.audio_base64, audio.mime || "audio/mpeg");
    audioUrlRef.current = url;
    a.src = url;

    setCurrentTime(0);
    await a.play();
  }

  // -------------------------
  // Persist toggles
  // -------------------------
  useEffect(() => localStorage.setItem("lm_musicEnabled", String(musicEnabled)), [musicEnabled]);
  useEffect(() => localStorage.setItem("lm_sfxEnabled", String(sfxEnabled)), [sfxEnabled]);
  useEffect(() => localStorage.setItem("lm_autoplayEnabled", String(autoplayEnabled)), [autoplayEnabled]);

  // -------------------------
  // Keep bgm loop/volume synced
  // -------------------------
  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) return;
    bgm.loop = bgmLoop;
    if (bgm.paused) bgm.volume = bgmVolume;
  }, [bgmLoop, bgmVolume]);

  // -------------------------
  // Fade / ducking helpers
  // -------------------------
  function fadeTo(bgm: HTMLAudioElement, target: number, ms: number) {
    clearBgmFade();

    const start = bgm.volume;
    const steps = Math.max(1, Math.floor(ms / FADE_STEP_MS));
    let i = 0;

    bgmFadeTimerRef.current = window.setInterval(() => {
      i++;
      const t = i / steps;
      bgm.volume = Math.max(0, Math.min(1, start + (target - start) * t));
      if (i >= steps) clearBgmFade();
    }, FADE_STEP_MS);
  }

  async function bgmFadeIn() {
    if (!musicEnabled) return;
    if (!bgmUrl) return;

    const bgm = bgmRef.current;
    if (!bgm) return;

    if (bgm.src !== bgmUrl) {
      bgm.src = bgmUrl;
      bgm.loop = bgmLoop;
    }

    bgm.volume = 0;

    try {
      if (bgm.paused) await bgm.play();
    } catch {}

    fadeTo(bgm, bgmVolume, 250);
  }

  function bgmFadeOutAndPause(immediate?: boolean) {
    const bgm = bgmRef.current;
    if (!bgm) return;

    if (immediate) {
      clearBgmFade();
      bgm.volume = 0;
      pauseBgmHard();
      return;
    }

    fadeTo(bgm, 0, 200);
    window.setTimeout(() => pauseBgmHard(), 220);
  }

  function applyDucking(isNarrationPlaying: boolean) {
    const bgm = bgmRef.current;
    if (!bgm) return;
    if (!musicEnabled) return;
    if (!bgmUrl) return;

    const target = isNarrationPlaying ? bgmVolume * 0.35 : bgmVolume;
    fadeTo(bgm, target, 180);
  }

  // -------------------------
  // Autoplay helper
  // -------------------------
  async function goNextAndAutoplay() {
    if (!autoplayEnabled) return;
    if (idx >= segments.length - 1) return;

    stopAllPlayback();
    setNarrationMode("audio");
    setIdx((v) => v + 1);

    // allow state to update to next segment before replay
    setTimeout(() => {
      void playNarration();
    }, 60);
  }

  // -------------------------
  // Narration audio events
  // -------------------------
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => {
      setIsPlaying(true);
      if (narrationMode === "audio") applyDucking(true);
    };
    const onPause = () => {
      if (narrationMode === "audio") {
        applyDucking(false);
        setIsPlaying(false);
      }
    };
    const onTime = () => setCurrentTime(a.currentTime || 0);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnded = () => {
      if (narrationMode === "audio") applyDucking(false);
      setIsPlaying(false);
      void goNextAndAutoplay();
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationMode, musicEnabled, bgmVolume, autoplayEnabled, idx, segments.length]);

  // -------------------------
  // Karaoke loop + autoplay
  // -------------------------
  useEffect(() => {
    if (narrationMode !== "text") return;
    if (!isPlaying) return;
    if (!current?.segment_text) return;
    if (textStartedAt === null) return;

    let raf = 0;

    const text = current.segment_text;

    const segDurSec = (() => {
      if (
        Number.isFinite(current.start_ms) &&
        Number.isFinite(current.end_ms) &&
        (current.end_ms as number) > (current.start_ms as number)
      ) {
        return Math.max(2, ((current.end_ms as number) - (current.start_ms as number)) / 1000);
      }
      return Math.max(3, text.length / 18);
    })();

    const tick = () => {
      const elapsedSec = Math.max(0, (performance.now() - (textStartedAt as number)) / 1000);
      const t = Math.min(1, elapsedSec / segDurSec);
      const chars = Math.floor(t * text.length);
      setTextVisibleChars(chars);

      if (t >= 1) {
        setIsPlaying(false);
        void goNextAndAutoplay();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    narrationMode,
    isPlaying,
    current?.canon_cursor,
    current?.segment_text,
    textStartedAt,
    current?.start_ms,
    current?.end_ms,
    autoplayEnabled,
    idx,
    segments.length,
  ]);

  // -------------------------
  // Load episode/season/segments/profiles
  // -------------------------
  useEffect(() => {
    if (!episodeId) return;

    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        stopAllPlayback();
        setNarrationMode("audio");
        setHasStartedPlayback(false);

        setEpisode(null);
        setSeason(null);
        setSegments([]);
        setIdx(0);
        setProfiles([]);
        setProfileId("");
        setSuggestions([]);
        setDrawerOpen(false);
        setCurrentQuestion("");
        setCurrentResponse("");
        setDrawerMode("read");
        setDraftQuestion("");

        const epRes = await api.get<{ episode: Episode }>("/episode", { episode_id: episodeId });
        if (cancelled) return;
        const ep = epRes.episode || null;
        setEpisode(ep);

        if (ep?.season_key) {
          try {
            const sRes = await api.get<{ season: Season }>("/season", {
              season_key: ep.season_key,
              status: "all",
            });
            if (!cancelled) setSeason(sRes.season || null);
          } catch {
            if (!cancelled) setSeason(null);
          }
        }

        const segRes = await api.get<{ segments: Segment[] }>("/segments", { episode_id: episodeId });
        if (cancelled) return;
        setSegments(segRes.segments || []);
        setIdx(0);

        const profRes = await api.get<{ profiles: Profile[] }>("/profiles", { episode_id: episodeId });
        if (cancelled) return;
        const profs = profRes.profiles || [];
        setProfiles(profs);
        if (profs.length) setProfileId(profs[0].id);
      } catch (e) {
        if (cancelled) return;
        setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      stopAllPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  // -------------------------
  // Suggestions on segment change
  // -------------------------
  useEffect(() => {
    if (!episodeId || !current?.canon_cursor) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await api.get<{ suggestions: string[] }>("/suggestions", {
          episode_id: episodeId,
          canon_cursor: current.canon_cursor,
        });
        if (!cancelled) setSuggestions(res.suggestions || []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [episodeId, current?.canon_cursor]);

  // -------------------------
  // SFX scheduling (simple)
  // -------------------------
  function scheduleSfxForCurrentSegment(options?: { immediate?: boolean }) {
    stopSfxTimer();
    stopSfxNow();

    if (!sfxEnabled) return;
    if (!current?.sfx_url) return;

    const sfxUrl = resolvePublicAssetUrl(current.sfx_url || "");
    if (!sfxUrl) return;

    const baseDelayMs = Math.max(0, safeNumber(current.sfx_at_ms, 0));
    const delayMs = options?.immediate ? 0 : baseDelayMs;
    const vol = Math.max(0, Math.min(1, safeNumber(current.sfx_volume, 0.8)));

    sfxTimerRef.current = window.setTimeout(async () => {
      const sfx = sfxRef.current;
      if (!sfx) return;
      try {
        sfx.volume = vol;
        sfx.src = sfxUrl;
        await sfx.play();
      } catch {}
    }, delayMs);
  }

  // -------------------------
  // Play narration (audio -> fallback text)
  // -------------------------
  async function playNarration() {
    try {
      setErr("");
      if (!current) return;

      setHasStartedPlayback(true);

      // Start BGM + SFX
      await bgmFadeIn();
      scheduleSfxForCurrentSegment({ immediate: true });

      // try audio narration
      setNarrationMode("audio");
      setIsPlaying(true);

      const res = await api.post<{ audio: AudioPayload }>("/tts", {
        text: current.segment_text,
        speaker_id: current.speaker_id,
      });

      await playBase64Audio(res.audio);
    } catch (e) {
      stopNarrationAudio();

      await bgmFadeIn();
      scheduleSfxForCurrentSegment({ immediate: true });

      setNarrationMode("text");
      setIsPlaying(true);
      setTextVisibleChars(0);
      setTextStartedAt(performance.now());

      setHasStartedPlayback(true);

      setErr(`Audio indisponible (fallback texte). ${String(e)}`);
    }
  }

  async function ask(question: string) {
    try {
      setErr("");
      if (!episodeId || !current) return;
      if (!profileId) throw new Error("No profile selected");

      setBusyAsk(true);
      toast("Question envoyée", { duration: 1200 });

      const res = await api.post<{
        answer_text?: string;
        accepted?: boolean;
        answer_audio?: AudioPayload;
      }>("/ask", {
        episode_id: episodeId,
        canon_cursor: current.canon_cursor,
        profile_id: profileId,
        question,
        response_format: { audio: true },
      });

      setCurrentQuestion(question);
      setCurrentResponse(res.answer_text || "(pas de réponse texte)");
      setDrawerMode("read");
      setDrawerOpen(true);

      if (res.answer_audio?.audio_base64) {
        try {
          setNarrationMode("audio");
          await playBase64Audio(res.answer_audio);
        } catch {
          setNarrationMode("text");
          setIsPlaying(false);
        }
      }
    } catch (e) {
      setErr(`Ask failed: ${String(e)}`);
      setDrawerMode("read");
      setDrawerOpen(true);
    } finally {
      setBusyAsk(false);
    }
  }

  function openMicAsk() {
    pauseAllPlayback();

    setMicState("listening");
    setDrawerMode("ask");
    setDraftQuestion("");
    setCurrentQuestion("");
    setCurrentResponse("");
    setDrawerOpen(true);
  }

  async function submitDraftQuestion() {
    const q = draftQuestion.trim();
    if (!q) return;
    await ask(q);
  }

  function onPrev() {
    stopAllPlayback();
    setNarrationMode("audio");
    setIdx((v) => Math.max(0, v - 1));
  }

  function onNext() {
    stopAllPlayback();
    setNarrationMode("audio");
    setIdx((v) => Math.min(Math.max(0, segments.length - 1), v + 1));
  }

  // React to toggle changes while playing
  useEffect(() => {
    if (!hasStartedPlayback) return;
    if (musicEnabled && isPlaying) void bgmFadeIn();
    if (!musicEnabled) bgmFadeOutAndPause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicEnabled]);

  useEffect(() => {
    if (!hasStartedPlayback) return;
    if (!sfxEnabled) {
      stopSfxTimer();
      stopSfxNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfxEnabled]);

  useEffect(() => {
    if (micState === "listening") return;
    if (hasStartedPlayback && isPlaying) setMicState("speaking");
    else setMicState("idle");
  }, [isPlaying, hasStartedPlayback, micState]);

  // -------------------------
  // Render guards
  // -------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-foreground-muted">Loading…</p>
      </div>
    );
  }

  if (!episodeId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-foreground-muted">episodeId manquant</p>
      </div>
    );
  }

  const backTo = season?.season_key
    ? `${SKIN_BASE}/season/${encodeURIComponent(season.season_key)}`
    : `${SKIN_BASE}`;

  const narrationText = current?.segment_text || "";
  const visibleText = narrationMode === "text" ? narrationText.slice(0, textVisibleChars) : narrationText;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Cinematic blurred background (episode cover) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{
            backgroundImage: coverUrl ? `url("${coverUrl}")` : "none",
          }}
        />

        <div
          className="absolute inset-0 bg-center bg-cover opacity-70 animate-cover-drift"
          style={{
            backgroundImage: coverUrl ? `url("${coverUrl}")` : "none",
          }}
        />

        <div className="absolute inset-0 backdrop-blur-3xl bg-black/35" />

        {/* ✅ FIX typo */}
        <div className="absolute inset-0 bg-linear-to-b from-black/35 via-black/35 to-black/80" />

        <div className="absolute -inset-24 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_55%)]" />
      </div>

      {/* Hidden players */}
      <audio ref={bgmRef} />
      <audio ref={sfxRef} />
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <header className="px-6 py-5 flex items-center gap-4">
        <button onClick={() => navigate(backTo)} className="control-button w-10 h-10" aria-label="Retour">
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground-subtle uppercase tracking-wide truncate">{seasonTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`control-button w-10 h-10 ${autoplayEnabled ? "" : "opacity-50"}`}
            aria-label="Toggle autoplay"
            onClick={() => setAutoplayEnabled((v) => !v)}
            title="Autoplay"
            type="button"
          >
            ▶︎
          </button>

          <button
            className={`control-button w-10 h-10 ${musicEnabled ? "" : "opacity-50"}`}
            aria-label="Toggle musique"
            onClick={() => {
              const next = !musicEnabled;
              setMusicEnabled(next);
              if (!next) bgmFadeOutAndPause();
              if (next && isPlaying) void bgmFadeIn();
            }}
            title="Musique"
            type="button"
          >
            <Music className="w-5 h-5" />
          </button>

          <button
            className={`control-button w-10 h-10 ${sfxEnabled ? "" : "opacity-50"}`}
            aria-label="Toggle effets sonores"
            onClick={() => setSfxEnabled((v) => !v)}
            title="Effets sonores"
            type="button"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>

        {profiles.length ? (
          <select
            className="glass-panel px-3 py-2 text-sm outline-none"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.label || p.name || p.id) as string}
                {p.role_key ? ` (${p.role_key})` : ""}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {err ? (
        <div className="px-6">
          <div className="glass-panel px-4 py-3 border border-red-500/40 text-red-200">{err}</div>
        </div>
      ) : null}

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-10">
        {/* HERO (cover centered + orbit right on desktop) */}
        <div className="relative w-full max-w-4xl">
          <div className="hidden lg:block absolute top-1/2 -translate-y-1/2 right-0 z-30">
            <SuggestionOrbit
              suggestions={suggestions}
              onSelect={(s: string) => ask(s)}
              disabled={busyAsk}
              variant="right"
              className="translate-x-10"
            />
          </div>

          <div className="relative z-10 flex items-center justify-center mb-8">
            <OrbAnimation size={300} isActive={isPlaying} className="absolute" />

            <ProgressRing progress={progress} size={260} strokeWidth={4} className="z-10">
              <CircularCover src={coverUrl || ""} alt={episodeTitle} size="xl" />
            </ProgressRing>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-foreground text-center mb-2 animate-fade-in">
          {episodeTitle}
        </h1>

        <p className="text-sm text-foreground-muted mb-5">
          {narrationMode === "audio" ? (
            <>
              {formatTime(currentTime)} / {duration ? formatTime(duration) : "—"}
            </>
          ) : (
            <>Lecture texte</>
          )}{" "}
          · Segment {idx + 1} / {segments.length}
        </p>

        <AudioControls
          isPlaying={isPlaying}
          onPlayPause={async () => {
            const a = audioRef.current;

            if (isPlaying) {
              pauseAllPlayback();
              return;
            }

            setHasStartedPlayback(true);

            await bgmFadeIn();
            scheduleSfxForCurrentSegment({ immediate: true });

            if (narrationMode === "text" && hasStartedPlayback) {
              setIsPlaying(true);

              const text = current?.segment_text || "";
              const ratio = text.length ? textVisibleChars / text.length : 0;

              const segDurSec = (() => {
                if (
                  current &&
                  Number.isFinite(current.start_ms) &&
                  Number.isFinite(current.end_ms) &&
                  (current.end_ms as number) > (current.start_ms as number)
                ) {
                  return Math.max(2, ((current.end_ms as number) - (current.start_ms as number)) / 1000);
                }
                return Math.max(3, text.length / 18);
              })();

              setTextStartedAt(performance.now() - ratio * segDurSec * 1000);
              return;
            }

            if (a && narrationMode === "audio" && a.src) {
              try {
                await a.play();
              } catch (e) {
                setErr(`Playback failed: ${String(e)}`);
              }
              return;
            }

            await playNarration();
          }}
          onPrevious={onPrev}
          onNext={onNext}
          className="mb-6"
        />

        {hasStartedPlayback && narrationMode === "text" && current ? (
          <div className="w-full max-w-lg glass-panel p-4 mb-6">
            <div className="text-xs uppercase tracking-wide text-foreground-subtle mb-2">
              Narration (karaoké)
            </div>

            <div className="text-sm text-foreground whitespace-pre-wrap">
              {visibleText}
              {isPlaying ? <span className="opacity-60">▍</span> : null}
            </div>

            <div className="mt-3 text-xs text-foreground-muted">
              Audio indisponible — lecture en mode texte (dévoilement progressif).
            </div>
          </div>
        ) : null}

        <div className="w-full max-w-lg mb-6 flex items-center justify-center">
          <button
            type="button"
            className="mic-button"
            onClick={openMicAsk}
            aria-label="Interrompre et poser une question"
            title="Poser une question"
          >
            <span className="mic-ring" />
            <span className="mic-core">
              <MicIcon size={24} className="text-white" />
            </span>
          </button>
        </div>

        <div className="lg:hidden w-full max-w-lg">
          <SuggestionChips
            suggestions={suggestions}
            onSelect={(s: string) => ask(s)}
            disabled={busyAsk}
            className="mt-2"
            title="Suggestions"
          />
        </div>
      </main>

      <AIResponseDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode={drawerMode}
        question={currentQuestion}
        response={currentResponse}
        draft={draftQuestion}
        onDraftChange={setDraftQuestion}
        onSubmit={submitDraftQuestion}
        submitLabel={busyAsk ? "Envoi..." : "Envoyer"}
        disabled={busyAsk}
        helperText={
          drawerMode === "ask"
            ? "La narration est interrompue. Écris ta question puis envoie."
            : undefined
        }
      />
    </div>
  );
}