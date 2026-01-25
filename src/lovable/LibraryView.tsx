import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Volume2, VolumeX, Play } from "lucide-react";
import { api } from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";

const SKIN_BASE = "/skins/lovable-v1";

type Season = {
  season_key: string;
  title?: string | null;
  description?: string | null;
  cover_url?: string | null;
  status?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

type SeasonsResponse = { seasons?: Season[] };

type ContinueListening = {
  episode_id: string;
  episode_title?: string;
  season_key?: string;
  season_title?: string;
  cover_url?: string;
  segment_index?: number;
  canon_cursor?: string;
  updated_at: number;
};

function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function pickFeatured(seasons: Season[]) {
  if (!seasons.length) return null;

  const score = (s: Season) => {
    const isPublished = (s.status || "").toLowerCase() === "published" ? 1 : 0;
    const t = Date.parse(s.published_at || s.created_at || "") || 0;
    return isPublished * 10_000_000_000 + t;
  };

  return [...seasons].sort((a, b) => score(b) - score(a))[0] || null;
}

function readContinueListening(): ContinueListening | null {
  try {
    const raw = localStorage.getItem("lm_continueListening");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.episode_id) return null;
    return parsed as ContinueListening;
  } catch {
    return null;
  }
}

/**
 * Small UI sounds without assets.
 * - Works only after a user gesture (browser policy).
 */
function useUISounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensure = () => {
    if (!enabled) return null;
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!Ctx) return null;
      ctxRef.current = new Ctx();
      return ctxRef.current;
    } catch {
      return null;
    }
  };

  const click = () => {
    if (!enabled) return;
    const ctx = ensure();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.03);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.065);
  };

  return { click };
}

function SeasonCardSkeleton() {
  return (
    <div className="glass-panel p-4 border border-white/8 overflow-hidden relative">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full animate-[shimmer_1.2s_infinite] bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.14),transparent)]" />
      </div>
      <div className="flex gap-4 items-center">
        <div className="w-14 h-14 rounded-2xl bg-white/10" />
        <div className="flex-1">
          <div className="h-4 w-44 bg-white/10 rounded mb-2" />
          <div className="h-3 w-72 bg-white/10 rounded" />
        </div>
        <div className="w-8 h-8 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}

export default function LibraryView() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [continueItem, setContinueItem] = useState<ContinueListening | null>(() => readContinueListening());

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [showScrollCue, setShowScrollCue] = useState(true);

  // UI sounds toggle (persisted)
  const [uiSoundsEnabled, setUiSoundsEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("lm_uiSoundsEnabled");
    return v === null ? true : v === "true";
  });

  const uiSounds = useUISounds(uiSoundsEnabled);

  useEffect(() => {
    try {
      localStorage.setItem("lm_uiSoundsEnabled", String(uiSoundsEnabled));
    } catch {}
  }, [uiSoundsEnabled]);

  // load seasons
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        const res = await api.get<SeasonsResponse>("/seasons", { status: "all" });
        if (cancelled) return;

        setSeasons(res.seasons || []);
      } catch (e) {
        if (cancelled) return;
        setErr(String(e));
        setSeasons([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ refresh continue listening when coming back (focus + visibilitychange like SeasonView)
  useEffect(() => {
    const sync = () => setContinueItem(readContinueListening());
    sync();

    const onFocus = () => sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // scroll cue
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 12) setShowScrollCue(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const featured = useMemo(() => pickFeatured(seasons), [seasons]);
  const heroCover = resolvePublicAssetUrl(featured?.cover_url || "");

  const continueCover = resolvePublicAssetUrl(continueItem?.cover_url || "");
  const continueHas = Boolean(continueItem?.episode_id);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return (seasons || [])
      .filter((s) => {
        const st = (s.status || "").toLowerCase();
        if (filter === "published") return st === "published";
        if (filter === "draft") return st !== "published";
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        const hay = normalize(`${s.title || ""} ${s.description || ""} ${s.season_key || ""}`);
        return hay.includes(q);
      });
  }, [seasons, search, filter]);

  return (
    <div className="min-h-screen pb-10">
      {/* HERO background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: heroCover ? `url("${heroCover}")` : "none" }}
        />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-55 animate-cover-drift"
          style={{ backgroundImage: heroCover ? `url("${heroCover}")` : "none" }}
        />
        <div className="absolute inset-0 backdrop-blur-3xl bg-black/40" />
        <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/45 to-black/90" />
        <div className="absolute -inset-24 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-noise" />
      </div>

      {/* Header sticky */}
      <header className="sticky top-0 z-20 px-6 py-5 backdrop-blur-xl bg-background/50 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground-subtle uppercase tracking-wide">Lovable Skin</p>
            <h1 className="text-lg font-semibold text-foreground truncate">Bibliothèque</h1>
          </div>

          {/* UI sounds toggle */}
          <button
            type="button"
            onClick={() => {
              uiSounds.click();
              setUiSoundsEnabled((v) => !v);
            }}
            className={cn(
              "control-button w-10 h-10",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30",
              uiSoundsEnabled ? "" : "opacity-60"
            )}
            aria-label="Sons UI"
            title="Sons UI"
          >
            {uiSoundsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Search */}
          <div className="hidden sm:flex items-center gap-2 glass-panel px-3 py-2 border border-white/8">
            <Search className="w-4 h-4 text-foreground-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une saison…"
              className="bg-transparent outline-none text-sm w-56 placeholder:text-foreground-subtle"
            />
          </div>
        </div>
      </header>

      {/* Hero content */}
      <section className="px-6 pt-10 pb-6">
        <div className="max-w-5xl mx-auto">
          {err ? (
            <div className="glass-panel px-4 py-3 border border-red-500/40 text-red-200 mb-6">{err}</div>
          ) : null}

          {/* Mobile search */}
          <div className="sm:hidden mb-5">
            <div className="flex items-center gap-2 glass-panel px-3 py-2 border border-white/8">
              <Search className="w-4 h-4 text-foreground-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une saison…"
                className="bg-transparent outline-none text-sm w-full placeholder:text-foreground-subtle"
              />
            </div>
          </div>

          {/* ✅ Continue Listening (premium, pinned) */}
          {continueHas ? (
            <div className="mb-4">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                {continueCover ? (
                  <div
                    className="absolute inset-0 opacity-35 bg-center bg-cover"
                    style={{ backgroundImage: `url("${continueCover}")` }}
                  />
                ) : null}
                <div className="absolute inset-0 bg-linear-to-r from-black/70 via-black/45 to-black/70" />
                <div className="absolute inset-0 [background:radial-gradient(circle_at_20%_20%,rgba(140,110,255,0.22),transparent_55%)]" />

                <div className="relative p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
                      {continueCover ? (
                        <img src={continueCover} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-white/70">Continuer l’écoute</div>
                      <div className="mt-1 text-sm md:text-base font-medium text-white truncate">
                        {(continueItem?.episode_title || "Épisode").toString()}
                      </div>
                      <div className="mt-1 text-xs text-white/70 truncate">
                        {(continueItem?.season_title || continueItem?.season_key || "").toString()}
                        {Number.isFinite(continueItem?.segment_index) ? (
                          <> · Segment {(continueItem?.segment_index || 0) + 1}</>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="md:ml-auto flex gap-2">
                    {continueItem?.season_key ? (
                      <button
                        type="button"
                        className={cn(
                          "control-button h-10 px-4 rounded-full",
                          "border border-white/12 bg-white/8 hover:bg-white/12 transition transform-gpu",
                          "active:scale-[0.99]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                        )}
                        onClick={() => {
                          uiSounds.click();
                          navigate(`${SKIN_BASE}/season/${encodeURIComponent(continueItem.season_key!)}`);
                        }}
                      >
                        Saison <ChevronRight className="w-4 h-4 ml-1" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className={cn(
                        "group relative control-button h-10 px-4 rounded-full",
                        "border border-white/12 bg-white/12 hover:bg-white/16 transition transform-gpu",
                        "active:scale-[0.99]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                      )}
                      onClick={() => {
                        uiSounds.click();
                        navigate(`${SKIN_BASE}/play/${encodeURIComponent(continueItem!.episode_id)}`);
                      }}
                    >
                      <span className="absolute -inset-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.14),transparent_55%)]" />
                      <span className="inline-flex items-center gap-2 relative">
                        <span className="relative flex">
                          <span className="absolute -inset-1 rounded-full bg-white/15 blur-md animate-pulse" />
                          <Play className="w-4 h-4 relative" />
                        </span>
                        Reprendre <ChevronRight className="w-4 h-4 -ml-1" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Featured / Filters */}
          <div className="glass-panel p-6 border border-white/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(140,110,255,0.18),transparent_55%)]" />
            <div className="relative">
              <p className="text-xs uppercase tracking-wide text-foreground-subtle mb-2">Saison à la une</p>

              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl md:text-3xl font-semibold text-foreground leading-tight truncate">
                    {(featured?.title || featured?.season_key || "—").toString()}
                  </h2>
                  <p className="text-sm text-foreground-muted mt-2 max-w-2xl line-clamp-2">
                    {(featured?.description || "Explore les saisons disponibles et lance un épisode.").toString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className={cn(
                      "control-button h-10 px-4 rounded-full",
                      "border border-white/10 bg-white/5 hover:bg-white/10 transition transform-gpu",
                      "active:scale-[0.99]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                    )}
                    onClick={() => {
                      uiSounds.click();
                      if (featured?.season_key) {
                        navigate(`${SKIN_BASE}/season/${encodeURIComponent(featured.season_key)}`);
                      } else if (seasons?.[0]?.season_key) {
                        navigate(`${SKIN_BASE}/season/${encodeURIComponent(seasons[0].season_key)}`);
                      }
                    }}
                    disabled={!featured?.season_key && !seasons.length}
                  >
                    Ouvrir <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {(["all", "published", "draft"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      uiSounds.click();
                      setFilter(k);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs border transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30",
                      filter === k
                        ? "border-white/20 bg-white/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    {k === "all" ? "Tout" : k === "published" ? "Publiées" : "Brouillons"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ✅ Scroll cue (premium) */}
          {showScrollCue ? (
            <div className="mt-6 flex justify-center">
              <div
                className={cn(
                  "glass-panel px-4 py-2 border border-white/10 text-xs text-foreground-muted",
                  "flex items-center gap-2 animate-fade-in"
                )}
              >
                <span className="opacity-80 inline-flex animate-bounce-soft">↓</span>
                Fais défiler pour voir toutes les saisons
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* List */}
      <main className="px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">Saisons</h3>
            <p className="text-xs text-foreground-subtle">
              {loading ? "Chargement…" : `${filtered.length} résultat(s)`}
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              <SeasonCardSkeleton />
              <SeasonCardSkeleton />
              <SeasonCardSkeleton />
            </div>
          ) : null}

          {!loading && !filtered.length ? (
            <div className="glass-panel p-6 border border-white/10 text-foreground-muted">Aucune saison trouvée.</div>
          ) : null}

          <div className="space-y-3">
            {filtered.map((s, i) => {
              const cover = resolvePublicAssetUrl(s.cover_url || "");
              const st = (s.status || "").toLowerCase();
              const isPublished = st === "published";

              return (
                <button
                  key={s.season_key}
                  type="button"
                  onClick={() => {
                    uiSounds.click();
                    navigate(`${SKIN_BASE}/season/${encodeURIComponent(s.season_key)}`);
                  }}
                  className={cn(
                    "w-full text-left glass-panel p-4 border border-white/8",
                    "transition transform-gpu will-change-transform",
                    "hover:bg-white/6 hover:border-white/14 hover:shadow-[0_18px_60px_rgba(0,0,0,0.35)]",
                    "active:scale-[0.995]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black/30"
                  )}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <div className="flex gap-4 items-center">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/6 border border-white/10">
                      {cover ? (
                        <img
                          src={cover}
                          alt={s.title || s.season_key}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-base font-medium text-foreground truncate">
                          {(s.title || s.season_key).toString()}
                        </p>
                        <span
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border",
                            isPublished
                              ? "border-emerald-500/30 text-emerald-200 bg-emerald-500/10"
                              : "border-white/10 text-foreground-subtle bg-white/5"
                          )}
                        >
                          {isPublished ? "Publié" : "Draft"}
                        </span>
                      </div>

                      <p className="text-sm text-foreground-muted line-clamp-2 mt-1">
                        {(s.description || "—").toString()}
                      </p>
                    </div>

                    <div className="w-9 h-9 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5">
                      <ChevronRight className="w-4 h-4 text-foreground-subtle" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <style>{`
        @keyframes shimmer { 
          0% { transform: translateX(-40%); }
          100% { transform: translateX(140%); }
        }
        @keyframes coverDrift {
          0%   { transform: scale(1.08) translate3d(-1.5%, -1%, 0); filter: blur(26px) saturate(1.05); }
          50%  { transform: scale(1.12) translate3d(1.5%, 1%, 0);  filter: blur(28px) saturate(1.1); }
          100% { transform: scale(1.08) translate3d(-1.5%, -1%, 0); filter: blur(26px) saturate(1.05); }
        }
        .animate-cover-drift {
          animation: coverDrift 18s ease-in-out infinite;
          will-change: transform, filter;
        }
        .bg-noise {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
          mix-blend-mode: overlay;
          opacity: 0.08;
        }
        @keyframes bounceSoft {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(3px); }
        }
        .animate-bounce-soft {
          animation: bounceSoft 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}