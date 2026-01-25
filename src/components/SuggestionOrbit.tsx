import { cn } from "@/lib/utils";

type Props = {
  suggestions: string[];
  onSelect: (s: string) => void;
  disabled?: boolean;
  className?: string;
  variant?: "orbit" | "right";
};

export default function SuggestionOrbit({
  suggestions,
  onSelect,
  disabled,
  className,
  variant = "right",
}: Props) {
  if (!suggestions?.length) return null;

  // <= 3 visibles comme sur ton screenshot
  const items = suggestions.slice(0, 3);

  // RIGHT COLUMN (assistive bubbles en arc)
  if (variant === "right") {
    const ARC = [
      { x: 8, y: -34 }, // bubble 1: un peu plus haut
      { x: 24, y: 0 },  // bubble 2: centre (la plus proche)
      { x: 8, y: 34 },  // bubble 3: un peu plus bas
    ];

    return (
      <div className={cn("w-[320px] flex flex-col gap-3", className)}>
        {items.map((s, i) => {
          const p = ARC[i] || ARC[1];

          return (
            <button
              key={`${i}-${s}`}
              disabled={disabled}
              onClick={() => onSelect(s)}
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
              style={{
                transform: `translate(${p.x}px, ${p.y}px)`,
              }}
              title={s}
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

  // ORBIT mode (pas utilisé pour l’instant)
  return null;
}