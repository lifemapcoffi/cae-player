import { cn } from "@/lib/utils";

interface CircularCoverProps {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  showGlow?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-12 h-12",
  md: "w-20 h-20",
  lg: "w-32 h-32",
  xl: "w-56 h-56",
};

export const CircularCover = ({
  src,
  alt,
  size = "md",
  showGlow = false,
  className,
}: CircularCoverProps) => {
  const hasSrc = Boolean(src && String(src).trim().length > 0);

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      {showGlow && (
        <div className="absolute -inset-2.5 rounded-full opacity-50 blur-xl animate-pulse-glow bg-linear-to-r from-primary via-accent to-primary" />
      )}

      <div className="cover-circle w-full h-full">
        {hasSrc ? (
          <img src={String(src)} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-foreground-muted text-xs">
            No cover
          </div>
        )}
      </div>
    </div>
  );
};