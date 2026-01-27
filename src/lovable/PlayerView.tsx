// src/lovable/PlayerView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Music, Volume2, FileText, X } from "lucide-react";
import { CircularCover } from "@/components/CircularCover";
import { ProgressRing } from "@/components/ProgressRing";
import { OrbAnimation } from "@/components/OrbAnimation";
import { AudioControls } from "@/components/AudioControls";
import { SuggestionChips } from "@/components/SuggestionChips";
import { AIResponseDrawer } from "@/components/AIResponseDrawer";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/assets";
import { MicIcon } from "@/components/icons/MicIcon";
import { cn } from "@/lib/utils";

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

  // ✅ Narration track (mp3) — like BGM/SFX
  narration_url?: string | null;
  narration_at_ms?: number | null; // ms offset inside the narration file (best-effort)
  narration_volume?: number | null; // 0..1
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

/**
 * Desktop-only orbit bubbles rendered locally to avoid transform conflicts
 * (and guarantee "float" + right-side orbit around the cover).
 */
function DesktopOrbit({
  suggestions,
  disabled,
  onSelect,
}: {
  suggestions: string[];
  disabled?: boolean;
  onSelect: (s: string) => void;
}) {
  const items = (suggestions || []).slice(0, 3);

  // arc offsets relative to the orbit container, tuned to sit “around” the cover
  const ARC = [
    { x: 0, y: -46 },
    { x: 18, y: 0 },
    { x: 0, y: 46 },
  ];

  if (!items.length) return null;

  return (
    <div className="w-85 flex flex-col gap-3 pointer-events-auto">
      {items.map((s, i) => {
        const p = ARC[i] || ARC[1];
        return (
          <button
            key={`${i}-${s}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(s)}
            title={s}
            className={cn(
              "group relative text-left",
              "px-4 py-2.5 rounded-full",
              "border border-white/10 bg-white/5 backdrop-blur-xl",
              "text-[13px] leading-snug text-white/90",
              "shadow-[0_10px_35px_rgba(0,0,0,0.28)]",
              "transition transform-gpu will-change-transform",
              "hover:bg-white/10 hover:border-white/20 hover:shadow-[0_14px_45px_rgba(0,0,0,0.35)]",
              "active:scale-[0.99]",
              "truncate",
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              i === 0 ? "animate-float-1" : i === 1 ? "animate-float-2" : "animate-float-3"
            )}
            // IMPORTANT: use `translate` (not `transform`) so it doesn't override the float animation.
            style={
              {
                translate: `${p.x}px ${p.y}px`,
              } as any
            }
          >
            <span
              className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200
                         bg-[radial-gradient(circle_at_25%_25%,rgba(140,110,255,0.35),transparent_60%)]
                         group-hover:opacity-100"
            />
            <span
              className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200
                         ring-1 ring-white/10 group-hover:opacity-100"
            />
            {s}
          </button>
        );
      })}
    </div>
  );
}

function TranscriptDrawer({
  open,
  onClose,
  title,
  segments,
  currentIdx,
  narrationMode,
  visibleText,
  fullCurrentText,
  onJumpTo,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  segments: Segment[];
  currentIdx: number;
  narrationMode: "audio" | "text";
  visibleText: string;
  fullCurrentText: string;
  onJumpTo: (idx: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // focus the close button for keyboard users
    setTimeout(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("[data-close='1']")?.focus();
    }, 0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fermer la transcription"
      />
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <div
          ref={panelRef}
          className={cn(
            "mx-auto w-full max-w-2xl",
            "glass-panel border border-white/10 overflow-hidden",
            "shadow-[0_24px_90px_rgba(0,0,0,0.6)]"
          )}
          style={{
            // keep it “app-like” on mobile: drawer scrolls internally
            maxHeight: "82dvh",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-foreground-subtle">Transcription</div>
              <div className="text-sm font-medium text-foreground truncate">{title}</div>
            </div>

            <button
              data-close="1"
              type="button"
              onClick={onClose}
              className={cn(
                "control-button w-10 h-10",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
              )}
              aria-label="Fermer"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body (internal scroll) */}
          <div className="px-4 py-4 overflow-auto" style={{ maxHeight: "calc(82dvh - 56px)" }}>
            {/* Current segment (karaoke highlight if in text mode) */}
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wide text-foreground-subtle mb-2">
                En cours{narrationMode === "text" ? " · Karaoké" : ""}
              </div>

              <div className="glass-panel border border-white/10 p-3">
                {narrationMode === "text" ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    <span className="text-white">{visibleText}</span>
                    {visibleText.length < fullCurrentText.length ? (
                      <span className="text-white/35">{fullCurrentText.slice(visibleText.length)}</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{fullCurrentText}</p>
                )}
              </div>
            </div>

            {/* Full list */}
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-foreground-subtle mb-2">Tous les segments</div>

              {segments.map((s, i) => {
                const isCurrent = i === currentIdx;
                return (
                  <button
                    key={`${s.canon_cursor}-${i}`}
                    type="button"
                    onClick={() => onJumpTo(i)}
                    className={cn(
                      "w-full text-left",
                      "px-3 py-2 rounded-2xl border transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30",
                      isCurrent
                        ? "border-white/18 bg-white/10"
                        : "border-white/8 bg-white/5 hover:bg-white/8 hover:border-white/14"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className={cn("text-xs", isCurrent ? "text-white/80" : "text-foreground-subtle")}>
                        {isCurrent ? "EN COURS" : "Passage"}
                    </div>
                      {isCurrent ? <span className="text-[10px] text-white/70">EN COURS</span> : null}
                    </div>
                    <div className={cn("text-sm line-clamp-2", isCurrent ? "text-white/90" : "text-foreground/85")}>
                      {s.segment_text}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayerView() {
  const navigate = useNavigate();
  const { episodeId } = useParams<{ episodeId: string }>();

  const [micState, setMicState] = useState<MicState>("idle");

  // Narration audio players (double-buffer for seamless)
  const narrationARef = useRef<HTMLAudioElement | null>(null);
  const narrationBRef = useRef<HTMLAudioElement | null>(null);

  // for base64 blob cleanup (per active play)
  const narrationBlobUrlRef = useRef<string | null>(null);

  // which one is currently "active" (playing/controlled)
  const activeNarrationRef = useRef<"A" | "B">("A");

  function getActiveNarrationEl() {
    return activeNarrationRef.current === "A" ? narrationARef.current : narrationBRef.current;
  }
  function getInactiveNarrationEl() {
    return activeNarrationRef.current === "A" ? narrationBRef.current : narrationARef.current;
  }
  function flipActiveNarration() {
    activeNarrationRef.current = activeNarrationRef.current === "A" ? "B" : "A";
  }

  // BGM + SFX players
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const sfxTimerRef = useRef<number | null>(null);

  const sfxWasPlayingRef = useRef<boolean>(false);

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

  // ✅ Transcription drawer (internal scroll, no page scroll)
  const [transcriptOpen, setTranscriptOpen] = useState(false);

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
    const text = current?.segment_text || "";
    if (!text.length) return 0;
    const p = Math.round((textVisibleChars / text.length) * 100);
    return Math.max(0, Math.min(100, p));
  }, [narrationMode, duration, currentTime, current?.segment_text, textVisibleChars]);

  // -------------------------
  // Cleanup helpers
  // -------------------------

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
    // Narration (active only)
    pauseActiveNarration();

    // Text mode
    stopTextPlayback();

    // BGM (pause doux)
    bgmFadeOutAndPause();

    // SFX: pause si en cours, et stop timer
    stopSfxTimer();
    const sfx = sfxRef.current;
    if (sfx) {
      try {
        sfxWasPlayingRef.current = !sfx.paused && sfx.currentTime > 0;
        sfx.pause();
      } catch {}
    }

    setIsPlaying(false);
  }

  function stopAllPlayback() {
  stopAllNarration();

  // remettre A actif AVANT de calculer active/inactive
  activeNarrationRef.current = "A";

  // maintenant seulement, on peut clear l'inactif
  const inactive = getInactiveNarrationEl();
  if (inactive) inactive.removeAttribute("src");

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
    // stop both narration els
    stopNarrationAudioHard(narrationARef.current);
    stopNarrationAudioHard(narrationBRef.current);
    cleanupNarrationBlobUrl();

    // on rejoue sur l'active
    const a = getActiveNarrationEl();
    if (!a) return;

    const url = b64ToBlobUrl(audio.audio_base64, audio.mime || "audio/mpeg");
    narrationBlobUrlRef.current = url;

    a.src = url;
    setCurrentTime(0);
    await a.play();
    setIsPlaying(true);
  }

  function cleanupNarrationBlobUrl() {
  if (narrationBlobUrlRef.current) {
    try { URL.revokeObjectURL(narrationBlobUrlRef.current); } catch {}
    narrationBlobUrlRef.current = null;
  }
}

function stopNarrationAudioHard(el?: HTMLAudioElement | null) {
  const a = el ?? getActiveNarrationEl();
  if (!a) return;
  try { a.pause(); } catch {}
  try { a.currentTime = 0; } catch {}
  a.removeAttribute("src");
  // NOTE: do not cleanup blob here unless you know it's blob
}

function pauseActiveNarration() {
  const a = getActiveNarrationEl();
  if (!a) return;
  try { a.pause(); } catch {}
}

function stopAllNarration() {
  stopNarrationAudioHard(narrationARef.current);
  stopNarrationAudioHard(narrationBRef.current);
  cleanupNarrationBlobUrl();
}

async function setNarrationSrcAndPlay(
  el: HTMLAudioElement,
  url: string,
  opts?: { volume?: number | null; atMs?: number | null; autoplay?: boolean }
) {
  el.src = url;

  const vol = Math.max(0, Math.min(1, safeNumber(opts?.volume, 1)));
  el.volume = vol;

  const atSec = Math.max(0, safeNumber(opts?.atMs, 0) / 1000);
  if (atSec > 0) {
    if (!Number.isFinite(el.duration) || el.duration === 0) {
      await new Promise<void>((resolve) => {
        const onMeta = () => {
          el.removeEventListener("loadedmetadata", onMeta);
          resolve();
        };
        el.addEventListener("loadedmetadata", onMeta, { once: true });
      });
    }
    try { el.currentTime = atSec; } catch {}
  }

  if (opts?.autoplay !== false) {
    await el.play();
  } else {
    // preload only
    try { el.load(); } catch {}
  }
}

function resolveNarrationUrlForSegment(seg: Segment | null | undefined) {
  if (!seg) return "";
  return resolvePublicAssetUrl(seg.narration_url || "");
}

async function preloadNextNarration() {
  const nextSeg = segments[idx + 1];
  const nextUrl = resolveNarrationUrlForSegment(nextSeg);
  const inactive = getInactiveNarrationEl();
  if (!inactive) return;

  // Pas de narration => pas de preload
  if (!nextUrl) {
    inactive.removeAttribute("src");
    return;
  }

  // Evite de reload si c’est déjà la bonne source
  if (inactive.src === nextUrl) return;

  try {
    await setNarrationSrcAndPlay(inactive, nextUrl, {
      volume: nextSeg?.narration_volume ?? 1,
      atMs: nextSeg?.narration_at_ms ?? 0,
      autoplay: false, // preload only
    });
  } catch {
    // Si preload échoue, on n'empêche pas la lecture courante
  }
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

    pauseAllPlayback(); // ou même rien du tout
    setNarrationMode("audio");
    setIdx((v) => v + 1);

    setTimeout(() => {
      void playNarration();
    }, 60);
  }

  // refs anti-closure (source de vérité sync)
  const idxRef = useRef(0);
  const segmentsRef = useRef<Segment[]>([]);

  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // Suggestions cache (canon_cursor -> suggestions)
  const suggestionsCacheRef = useRef<Map<string, string[]>>(new Map());
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  async function fetchSuggestionsForCursor(cursor: string) {
    if (!episodeId || !cursor) return [];

    // cache hit
    const hit = suggestionsCacheRef.current.get(cursor);
    if (hit) return hit;

    try {
      const res = await api.get<{ suggestions: string[] }>("/suggestions", {
        episode_id: episodeId,
        canon_cursor: cursor,
      });

      const list = res.suggestions || [];
      suggestionsCacheRef.current.set(cursor, list);
      return list;
    } catch {
      const list: string[] = [];
      suggestionsCacheRef.current.set(cursor, list);
      return list;
    }
  }

  function setSuggestionsForCursorIfCached(cursor: string) {
    const hit = suggestionsCacheRef.current.get(cursor);
    if (hit) setSuggestions(hit);
  }

  // -------------------------
// Narration audio events (A/B double-buffer, gapless-safe)
// -------------------------
useEffect(() => {
  const aEl = narrationARef.current;
  const bEl = narrationBRef.current;
  if (!aEl || !bEl) return;

  const syncFromActive = () => {
    const active = getActiveNarrationEl();
    if (!active) return;
    setIsPlaying(!active.paused);
  };

  const onPlaying = () => {
    syncFromActive();
    if (narrationMode === "audio") applyDucking(true);
  };

  const onPause = () => {
    syncFromActive();
    if (narrationMode === "audio") applyDucking(false);
  };

  const onTime = () => {
    const active = getActiveNarrationEl();
    if (!active) return;
    setCurrentTime(active.currentTime || 0);
    syncFromActive();
  };

  const onLoaded = () => {
    const active = getActiveNarrationEl();
    if (!active) return;
    setDuration(active.duration || 0);
  };

  // helper: schedule SFX for a specific segment (NOT "current" state)
  const scheduleSfxForSegment = (seg: Segment | null | undefined, opts?: { immediate?: boolean }) => {
    stopSfxTimer();
    stopSfxNow();

    if (!sfxEnabled) return;
    if (!seg?.sfx_url) return;

    const sfxUrl = resolvePublicAssetUrl(seg.sfx_url || "");
    if (!sfxUrl) return;

    const baseDelayMs = Math.max(0, safeNumber(seg.sfx_at_ms, 0));

    // align to narration time (best-effort)
    const active = getActiveNarrationEl();
    const narrationMs =
      narrationMode === "audio" && active ? Math.floor((active.currentTime || 0) * 1000) : 0;

    const remainingMs = Math.max(0, baseDelayMs - narrationMs);
    const delayMs = opts?.immediate ? 0 : remainingMs;

    const vol = Math.max(0, Math.min(1, safeNumber(seg.sfx_volume, 0.8)));

    sfxTimerRef.current = window.setTimeout(async () => {
      const sfx = sfxRef.current;
      if (!sfx) return;
      try {
        sfx.volume = vol;
        sfx.src = sfxUrl;
        await sfx.play();
      } catch {}
    }, delayMs);
  };

  const onEnded = async () => {
  // ⚠️ anti-pop: si on enchaîne sur le segment suivant, on reste DUCKED (pas de remontée)
  const localIdx = idxRef.current;
  const segs = segmentsRef.current;

  const willChain = autoplayEnabled && localIdx < segs.length - 1;

  if (narrationMode === "audio") {
    if (willChain) {
      // reste ducked + lisse vers le niveau ducked (au cas où ça aurait commencé à remonter)
      applyDucking(true);
    } else {
      // fin réelle => on remonte le BGM
      applyDucking(false);
    }
  }

  setIsPlaying(false);

  if (!willChain) return;

  const nextIdx = localIdx + 1;
  const nextSeg = segs[nextIdx] || null;

  // flip: inactive (preloaded) becomes active
  flipActiveNarration();
  const newActive = getActiveNarrationEl();

  setIdx(nextIdx);

  const nextCursor = segmentsRef.current[nextIdx]?.canon_cursor;
  if (nextCursor) {
    // instant UI if cached
    setSuggestionsForCursorIfCached(nextCursor);
    // ensure fetched (if not cached)
    setTimeout(() => void fetchSuggestionsForCursor(nextCursor), 0);
  }

  try {
    if (!newActive || !newActive.src) {
      setTimeout(() => void playNarration(), 0);
      return;
    }

    setCurrentTime(0);

    await bgmFadeIn();

    // ✅ toujours ducked juste avant le play (double-sécurité anti-pop)
    applyDucking(true);

    scheduleSfxForSegment(nextSeg, { immediate: true });

    await newActive.play();
    setIsPlaying(true);

    setTimeout(() => void preloadNextNarration(), 0);
  } catch {
    setTimeout(() => void playNarration(), 0);
  }
};

  const bind = (el: HTMLAudioElement) => {
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnded);
  };

  const unbind = (el: HTMLAudioElement) => {
    el.removeEventListener("playing", onPlaying);
    el.removeEventListener("pause", onPause);
    el.removeEventListener("timeupdate", onTime);
    el.removeEventListener("loadedmetadata", onLoaded);
    el.removeEventListener("ended", onEnded);
  };

  bind(aEl);
  bind(bEl);

  return () => {
    unbind(aEl);
    unbind(bEl);
  };
  // important: do NOT depend on idx/segments (we use refs to avoid closures)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [narrationMode, autoplayEnabled, musicEnabled, bgmVolume, sfxEnabled]);

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
        setTranscriptOpen(false);

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
    if (!episodeId) return;
    if (!current?.canon_cursor) return;

    let cancelled = false;

    const cursor = current.canon_cursor;
    const nextCursor = segments[idx + 1]?.canon_cursor;

    // 1) instant UI: si déjà en cache, on set tout de suite
    setSuggestionsForCursorIfCached(cursor);

    // 2) fetch (si pas en cache) puis update UI
    (async () => {
      const list = await fetchSuggestionsForCursor(cursor);
      if (!cancelled) setSuggestions(list);
    })();

    // 3) prefetch next (silencieux)
    if (nextCursor) {
      void fetchSuggestionsForCursor(nextCursor);
    }

    return () => {
      cancelled = true;
    };
  }, [episodeId, current?.canon_cursor, idx, segments]);

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

    // If narration already started, align SFX with narration time (best-effort)
    const active = getActiveNarrationEl();
    const narrationMs =
    narrationMode === "audio" && active
      ? Math.floor((active.currentTime || 0) * 1000)
      : 0;

    const remainingMs = Math.max(0, baseDelayMs - narrationMs);
    const delayMs = options?.immediate ? 0 : remainingMs;
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

    await bgmFadeIn();
    scheduleSfxForCurrentSegment({ immediate: true });

    // ✅ Narration must come from a pre-recorded mp3 track
    const narrationUrl = resolvePublicAssetUrl(current.narration_url || "");
    if (!narrationUrl) {
      // fallback to text (no narration track)
      stopAllNarration();

      setNarrationMode("text");
      setIsPlaying(true);
      setTextVisibleChars(0);
      setTextStartedAt(performance.now());

      setErr("Narration mp3 manquante pour ce segment (fallback texte).");
      return;
    }

    // AUDIO
    setNarrationMode("audio");
    setIsPlaying(true);

    // stop both narration els to avoid overlap (A/B)
    stopAllNarration();

    const active = getActiveNarrationEl();
    if (!active) return;

    await setNarrationSrcAndPlay(active, narrationUrl, {
      volume: current.narration_volume ?? 1,
      atMs: current.narration_at_ms ?? 0,
      autoplay: true,
    });

    // ✅ prepare next segment narration (preload on inactive)
    void preloadNextNarration();
  } catch (e) {
    // If mp3 fails, fallback to text
    stopAllNarration();

    await bgmFadeIn();
    scheduleSfxForCurrentSegment({ immediate: true });

    setNarrationMode("text");
    setIsPlaying(true);
    setTextVisibleChars(0);
    setTextStartedAt(performance.now());

    setHasStartedPlayback(true);

    setErr(`Narration mp3 indisponible (fallback texte). ${String(e)}`);
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

  useEffect(() => {
    // dès qu'on a un segment courant, on prépare le suivant
    void preloadNextNarration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, segments.length]);

  // -------------------------
  // Render guards
  // -------------------------
  if (loading) {
    return (
      <div className="h-dvh overflow-hidden flex items-center justify-center">
        <p className="text-foreground-muted">Loading…</p>
      </div>
    );
  }

  if (!episodeId) {
    return (
      <div className="h-dvh overflow-hidden flex items-center justify-center">
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
    <div
      className={cn(
        // ✅ "App feel": no page scroll
        "h-dvh overflow-hidden",
        "flex flex-col"
      )}
    >
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
        <div className="absolute inset-0 bg-linear-to-b from-black/35 via-black/35 to-black/80" />
        <div className="absolute -inset-24 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_55%)]" />
      </div>

      {/* Hidden players */}
      <audio ref={bgmRef} />
      <audio ref={sfxRef} />
      <audio ref={narrationARef} className="hidden" preload="auto" />
      <audio ref={narrationBRef} className="hidden" preload="auto" />

      {/* Header (no scroll) */}
      <header className="shrink-0 px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4">
        <button onClick={() => navigate(backTo)} className="control-button w-10 h-10" aria-label="Retour">
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground-subtle uppercase tracking-wide truncate">{seasonTitle}</p>
          <p className="text-[11px] text-foreground-muted truncate">
            {episode?.synopsis ? "Lecture" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Transcription drawer */}
          <button
            className="control-button w-10 h-10"
            aria-label="Transcription"
            title="Transcription"
            type="button"
            onClick={() => setTranscriptOpen(true)}
          >
            <FileText className="w-5 h-5" />
          </button>

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
            className="hidden md:block glass-panel px-3 py-2 text-sm outline-none"
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
        <div className="shrink-0 px-4 sm:px-6">
          <div className="glass-panel px-4 py-3 border border-red-500/40 text-red-200">{err}</div>
        </div>
      ) : null}

      {/* Main (no page scroll; everything fits; internal scroll only in drawers/panels) */}
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 sm:px-6 pb-6">
        {/* HERO wrapper must allow overflow for desktop orbit */}
        <div className="relative w-full max-w-4xl overflow-visible">
          {/* ✅ Desktop orbit: absolute right, floating */}
          <div className="hidden lg:block absolute top-1/2 -translate-y-1/2 right-0 z-30">
            <DesktopOrbit
              suggestions={suggestions}
              disabled={busyAsk}
              onSelect={(s) => ask(s)}
            />
          </div>

          {/* cover */}
          <div className="relative z-10 flex items-center justify-center mb-5 sm:mb-7">
            <OrbAnimation
              size={300}
              isActive={isPlaying}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
            />
            <ProgressRing progress={progress} size={260} strokeWidth={4} className="z-10">
              <CircularCover src={coverUrl || ""} alt={episodeTitle} size="xl" />
            </ProgressRing>
          </div>
        </div>

        <h1 className="text-xl sm:text-2xl font-semibold text-white text-center mb-2 animate-fade-in px-2">
          {episodeTitle}
        </h1>

        <p className="text-sm text-foreground-muted mb-4 sm:mb-5 text-center">
          {narrationMode === "audio" ? (
            <>
              {formatTime(currentTime)} / {duration ? formatTime(duration) : "—"}
            </>
          ) : (
            <>Lecture texte</>
          )}
        </p>

        <AudioControls
          isPlaying={isPlaying}
          onPlayPause={async () => {
            const a = getActiveNarrationEl();

            // ✅ source of truth: audio element state (when in audio mode)
            const actuallyPlaying =
              narrationMode === "audio" ? Boolean(a && !a.paused) : isPlaying;

            if (actuallyPlaying) {
              pauseAllPlayback();
              return;
            }

            setHasStartedPlayback(true);

            await bgmFadeIn();
            scheduleSfxForCurrentSegment({ immediate: true });

            // Resume TEXT mode if it was already started
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

            // AUDIO resume
            if (a && narrationMode === "audio" && a.src) {
              try {
                await bgmFadeIn();
                scheduleSfxForCurrentSegment(); // resync based on currentTime
                await a.play();

                // ✅ FORCING UI SYNC (le bug vient de là)
                setIsPlaying(true);
                applyDucking(true);
              } catch (e) {
                setErr(`Playback failed: ${String(e)}`);
              }
              return;
            }

            await playNarration();
          }}
          onPrevious={onPrev}
          onNext={onNext}
          className="mb-5 sm:mb-6"
        />

        {/* Karaoke preview panel (optional, internal scroll only) */}
        {hasStartedPlayback && narrationMode === "text" && current ? (
          <div className="w-full max-w-lg glass-panel p-4 mb-5 sm:mb-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs uppercase tracking-wide text-foreground-subtle">Narration (karaoké)</div>
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs border border-white/10 bg-white/5 hover:bg-white/10 transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                )}
                onClick={() => setTranscriptOpen(true)}
              >
                Transcription
              </button>
            </div>

            <div className="text-sm text-foreground whitespace-pre-wrap max-h-[18dvh] overflow-auto pr-1">
              {visibleText}
              {isPlaying ? <span className="opacity-60">▍</span> : null}
            </div>

            <div className="mt-3 text-xs text-foreground-muted">
              Audio indisponible — lecture en mode texte (dévoilement progressif).
            </div>
          </div>
        ) : null}

        {/* Micro action */}
        <div className="w-full max-w-lg mb-4 sm:mb-6 flex items-center justify-center">
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

        {/* Mobile suggestions dock */}
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

      {/* Ask/Answer drawer (already internal scroll by your component) */}
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
        helperText={drawerMode === "ask" ? "La narration est interrompue. Écris ta question puis envoie." : undefined}
      />

      {/* ✅ Transcription drawer (internal scroll, no page scroll) */}
      <TranscriptDrawer
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        title={episodeTitle}
        segments={segments}
        currentIdx={idx}
        narrationMode={narrationMode}
        visibleText={narrationMode === "text" ? visibleText : narrationText}
        fullCurrentText={narrationText}
        onJumpTo={(nextIdx) => {
          stopAllPlayback();
          setNarrationMode("audio");
          setIdx(nextIdx);
          setTranscriptOpen(false);
        }}
      />

      {/* Small local styles (kept here to avoid touching global files) */}
      <style>{`
        @keyframes coverDrift {
          0%   { transform: scale(1.08) translate3d(-1.5%, -1%, 0); filter: blur(26px) saturate(1.05); }
          50%  { transform: scale(1.12) translate3d(1.5%, 1%, 0);  filter: blur(28px) saturate(1.1); }
          100% { transform: scale(1.08) translate3d(-1.5%, -1%, 0); filter: blur(26px) saturate(1.05); }
        }
        .animate-cover-drift {
          animation: coverDrift 18s ease-in-out infinite;
          will-change: transform, filter;
        }
      `}</style>
    </div>
  );
}