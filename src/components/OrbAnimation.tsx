import { cn } from "@/lib/utils";

interface OrbAnimationProps {
  size?: number;
  isActive?: boolean;
  className?: string;
}

export const OrbAnimation = ({
  size = 280,
  isActive = true,
  className,
}: OrbAnimationProps) => {
  return (
    <div
      className={cn("absolute pointer-events-none", className)}
      style={{ width: size, height: size }}
    >
      {/* Outer orb layer */}
      <div
        className={cn(
          "absolute inset-0 rounded-full opacity-30 blur-2xl",
          isActive && "animate-orb-rotate"
        )}
        style={{
          background: "conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary-glow)), hsl(var(--primary)))",
        }}
      />
      
      {/* Middle orb layer */}
      <div
        className={cn(
          "absolute inset-4 rounded-full opacity-40 blur-xl",
          isActive && "animate-orb-rotate"
        )}
        style={{
          background: "conic-gradient(from 180deg, hsl(var(--accent)), hsl(var(--primary)), hsl(var(--accent-glow)), hsl(var(--accent)))",
          animationDirection: "reverse",
          animationDuration: "12s",
        }}
      />
      
      {/* Inner glow */}
      <div
        className="absolute inset-8 rounded-full opacity-20 blur-lg animate-pulse-glow"
        style={{
          background: "radial-gradient(circle, hsl(var(--primary-glow)) 0%, transparent 70%)",
        }}
      />
    </div>
  );
};
