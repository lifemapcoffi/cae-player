import { cn } from "@/lib/utils";

type Props = {
  suggestions: string[];
  onSelect: (s: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
};

export function SuggestionChips({
  suggestions,
  onSelect,
  disabled,
  className,
  title = "Suggestions",
}: Props) {
  if (!suggestions?.length) return null;

  const items = suggestions.slice(0, 6);

  return (
    <div className={cn("suggestions-panel", className)}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs uppercase tracking-wide text-foreground-subtle">
          {title}
        </div>

        <div className="text-xs text-foreground-muted">
          {disabled ? "…" : ""}
        </div>
      </div>

      {/* Wrap on desktop, horizontal scroll on small screens */}
      <div className="suggestions-row">
        {items.map((s, i) => (
          <button
            key={`${i}-${s}`}
            disabled={disabled}
            onClick={() => onSelect(s)}
            className={cn(
              "suggestion-chip",
              disabled ? "opacity-50 cursor-not-allowed" : ""
            )}
            title={s}
          >
            <span className="suggestion-chip-glow" />
            <span className="suggestion-chip-text">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SuggestionChips;