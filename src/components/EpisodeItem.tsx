import { CircularCover } from "./CircularCover";

interface EpisodeItemProps {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  duration?: string;

  // ✅ New (preferred): click anywhere on the panel
  onSelect?: () => void;

  // ✅ Backward-compat (old prop name)
  onPlay?: () => void;
}

export const EpisodeItem = ({
  title,
  summary,
  coverUrl,
  duration,
  onSelect,
  onPlay,
}: EpisodeItemProps) => {
  const handle = onSelect || onPlay;

  const clickable = typeof handle === "function";

  // If not clickable, keep the same layout but without button behavior.
  if (!clickable) {
    return (
      <div className="glass-surface rounded-xl p-4 flex items-center gap-4 animate-fade-in">
        <CircularCover src={coverUrl} alt={title} size="sm" />

        <div className="flex-1 min-w-0">
          <h4 className="text-base font-medium text-foreground truncate">{title}</h4>
          <p className="text-sm text-foreground-muted line-clamp-2 mt-0.5">{summary}</p>
          {duration && (
            <span className="text-xs text-foreground-subtle mt-1 inline-block">{duration}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      className={[
        "w-full text-left",
        "glass-surface rounded-xl p-4 flex items-center gap-4",
        "transition-all duration-300 hover:bg-muted/30",
        "group animate-fade-in",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
      ].join(" ")}
      aria-label={`Lire ${title}`}
    >
      <CircularCover src={coverUrl} alt={title} size="sm" />

      <div className="flex-1 min-w-0">
        <h4 className="text-base font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {title}
        </h4>
        <p className="text-sm text-foreground-muted line-clamp-2 mt-0.5">{summary}</p>
        {duration && (
          <span className="text-xs text-foreground-subtle mt-1 inline-block">{duration}</span>
        )}
      </div>

      {/* ✅ No Play button anymore */}
    </button>
  );
};