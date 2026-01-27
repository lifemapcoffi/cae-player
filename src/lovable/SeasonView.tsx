import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Play } from "lucide-react";
import { EpisodeItem } from "@/components/EpisodeItem";
import { api } from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/assets";

const SKIN_BASE = "/skins/lovable-v1";

type Season = {
  season_key: string;
  title?: string | null;
  description?: string | null;
  cover_url?: string | null;
};

type Episode = {
  id: string;
  season_key: string;
  episode_key?: string | null;
  title?: string | null;
  synopsis?: string | null;
  cover_url?: string | null;
};

type SeasonResponse = { season?: Season | null };
type EpisodesResponse = { episodes?: Episode[] };

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

function readContinueListening(): ContinueListening | null {
  try {
    const raw = localStorage.getItem("lm_continueListening");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContinueListening;
    if (!parsed?.episode_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function SeasonView() {
  const navigate = useNavigate();
  const { seasonKey } = useParams<{ seasonKey: string }>();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [season, setSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const [continueListening, setContinueListening] = useState<ContinueListening | null>(null);

  useEffect(() => {
    // load at mount + whenever page becomes visible again (user comes back from Player)
    const sync = () => setContinueListening(readContinueListening());
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

  useEffect(() => {
    if (!seasonKey) return;

    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        const [sRes, eRes] = await Promise.all([
          api.get<SeasonResponse>("/season", { season_key: seasonKey, status: "all" }),
          api.get<EpisodesResponse>("/episodes", { season_key: seasonKey, status: "all" }),
        ]);

        if (cancelled) return;

        setSeason(sRes.season || null);
        setEpisodes(eRes.episodes || []);
      } catch (e) {
        if (cancelled) return;
        setErr(String(e));
        setSeason(null);
        setEpisodes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [seasonKey]);

  const title = (season?.title || `Saison ${seasonKey}` || "Season").toString();
  const description = (season?.description || "").toString();

  const coverUrl = useMemo(() => resolvePublicAssetUrl(season?.cover_url || ""), [season?.cover_url]);
  const hasHeroCover = Boolean(coverUrl);

  const showContinue =
    Boolean(seasonKey) &&
    Boolean(continueListening?.episode_id) &&
    String(continueListening?.season_key || "") === String(seasonKey);

  const continueCover = resolvePublicAssetUrl(
    (continueListening?.cover_url || season?.cover_url || "") as string
  );

  const continueLabel = continueListening?.episode_title || "Reprendre";
  const continueSegment =
    typeof continueListening?.segment_index === "number" ? continueListening.segment_index + 1 : null;

  return (
    <div className="min-h-screen pb-10">
      {/* HERO: cover as full-width background with premium fade-out */}
      <section className="relative w-full overflow-hidden h-80 md:h-95 lg:h-105">
        {/* Background cover */}
        {hasHeroCover ? (
          <img
            src={coverUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover scale-[1.03]"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-black/40" />
        )}

        {/* Readability overlays */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 [background:radial-gradient(circle_at_50%_20%,rgba(140,110,255,0.28),transparent_55%)]" />
        {/* Fade to page background */}
        <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/40 to-background" />

        {/* Header (overlayed, still sticky-like feel) */}
        <header className="relative z-10 px-6 pt-6">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <button
              onClick={() => navigate(`${SKIN_BASE}`)}
              className="control-button w-10 h-10"
              aria-label="Retour"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-white/70 truncate">Saison</p>
              <h1 className="text-lg md:text-xl font-medium text-white truncate drop-shadow">{title}</h1>
            </div>
          </div>
        </header>

        {/* Hero title block */}
        <div className="relative z-10 px-6 pt-10 md:pt-14">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-semibold text-white drop-shadow">{title}</h2>

            {description ? <p className="mt-3 max-w-2xl text-sm text-white/75">{description}</p> : null}

            {loading ? <div className="mt-5 text-sm text-white/70">Loading…</div> : null}
          </div>
        </div>
      </section>

      {err ? (
        <div className="px-6 -mt-4 relative z-20">
          <div className="max-w-5xl mx-auto">
            <div className="glass-panel px-4 py-3 border border-red-500/40 text-red-200">{err}</div>
          </div>
        </div>
      ) : null}

      {/* Episodes list: pulled up into the fade for a premium continuity */}
      <main className="px-6 -mt-12 relative z-20">
        <div className="max-w-5xl mx-auto">
          <div className="glass-panel p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h3 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">Épisodes</h3>
              <span className="text-xs text-foreground-muted">{episodes.length ? `${episodes.length}` : ""}</span>
            </div>

            {/* ✅ Continue Listening pinned */}
            {showContinue ? (
              <div className="mb-4">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
                  {/* soft background */}
                  {continueCover ? (
                    <div
                      className="absolute inset-0 opacity-35 bg-center bg-cover"
                      style={{ backgroundImage: `url("${continueCover}")` }}
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-linear-to-r from-black/55 via-black/35 to-transparent" />
                  <div className="absolute inset-0 [background:radial-gradient(circle_at_20%_20%,rgba(140,110,255,0.25),transparent_55%)]" />

                  <div className="relative p-4 md:p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-white/70">
                        Reprendre l’épisode en cours
                      </div>
                      <div className="mt-1 text-sm md:text-base font-medium text-white truncate">
                        {continueLabel}
                      </div>
                      <div className="mt-1 text-xs text-white/70">
                        {continueSegment ? `Segment ${continueSegment}` : "Reprise disponible"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(`${SKIN_BASE}/play/${encodeURIComponent(continueListening!.episode_id)}`)
                      }
                      className={[
                        "group relative shrink-0",
                        "h-11 px-4 rounded-full",
                        "border border-white/12 bg-white/10 backdrop-blur-xl",
                        "text-sm font-medium text-white",
                        "shadow-[0_12px_40px_rgba(0,0,0,0.35)]",
                        "transition transform-gpu",
                        "hover:bg-white/16 hover:border-white/20 hover:-translate-y-px",
                        "active:translate-y-0 active:scale-[0.99]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
                      ].join(" ")}
                      aria-label="Reprendre"
                      title="Reprendre"
                    >
                      <span className="absolute -inset-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.14),transparent_55%)]" />
                      <span className="inline-flex items-center gap-2">
                        <span className="relative flex">
                          <span className="absolute -inset-1 rounded-full bg-white/15 blur-md animate-pulse" />
                          <Play className="w-4 h-4 relative" />
                        </span>
                        Reprendre
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {episodes.map((e, index) => {
                const epTitle =
                  (e.episode_key ? `${String(e.episode_key).toUpperCase()} — ` : "") + (e.title || "Untitled");

                return (
                  <div key={e.id} style={{ animationDelay: `${index * 90}ms` }} className="opacity-0 animate-fade-in">
                    <EpisodeItem
                      id={e.id}
                      title={(e.title || epTitle).toString()}
                      summary={(e.synopsis || "").toString()}
                      coverUrl={resolvePublicAssetUrl(e.cover_url)}
                      duration={""}
                      onSelect={() => navigate(`${SKIN_BASE}/play/${encodeURIComponent(e.id)}`)}
                    />
                  </div>
                );
              })}

              {!loading && !episodes.length ? <p className="text-foreground-muted">Aucun épisode.</p> : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}