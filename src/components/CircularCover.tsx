import { cn } from "@/lib/utils";
import { useEffect } from "react";

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

// --- Palette extraction (no deps) ---
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function rgbToCss(r: number, g: number, b: number, a = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${clamp01(a)})`;
}

// Quantize RGB to reduce bins (fast histogram)
function quantKey(r: number, g: number, b: number) {
  // 5 bits per channel
  const rq = r >> 3;
  const gq = g >> 3;
  const bq = b >> 3;
  return (rq << 10) | (gq << 5) | bq;
}

function unquantKey(key: number) {
  const rq = (key >> 10) & 31;
  const gq = (key >> 5) & 31;
  const bq = key & 31;
  // back to 0..255 center of bin
  return {
    r: rq * 8 + 4,
    g: gq * 8 + 4,
    b: bq * 8 + 4,
  };
}

async function extractPaletteFromImageUrl(url: string) {
  const img = new Image();
  // Important for canvas read (requires server CORS allowing it)
  img.crossOrigin = "anonymous";
  img.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });

  // Small canvas for speed
  const W = 64;
  const H = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas ctx missing");

  ctx.drawImage(img, 0, 0, W, H);

  // If CORS is not OK, the next line throws (tainted canvas)
  const { data } = ctx.getImageData(0, 0, W, H);

  // Histogram
  const bins = new Map<number, number>();

  // sample every 2 pixels (faster)
  for (let i = 0; i < data.length; i += 4 * 2) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // skip transparent + near-black/near-white a bit to keep orb colorful
    if (a < 180) continue;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 18 || lum > 245) continue;

    const key = quantKey(r, g, b);
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  const sorted = Array.from(bins.entries()).sort((a, b) => b[1] - a[1]);

  // Take top distinct colors (avoid very close duplicates)
  const picked: { r: number; g: number; b: number }[] = [];
  const minDist = 28;

  const dist = (c1: any, c2: any) => {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  for (const [key] of sorted) {
    const c = unquantKey(key);
    if (!picked.length || picked.every((p) => dist(p, c) >= minDist)) {
      picked.push(c);
    }
    if (picked.length >= 4) break;
  }

  // Fallback if image is too uniform
  while (picked.length < 4) {
    picked.push(picked[0] || { r: 168, g: 85, b: 247 });
  }

  return picked.slice(0, 4);
}

function setOrbCssVars(colors: { r: number; g: number; b: number }[]) {
  const root = document.documentElement;

  // Orb main colors
  root.style.setProperty("--orb-c1", rgbToCss(colors[0].r, colors[0].g, colors[0].b, 0.95));
  root.style.setProperty("--orb-c2", rgbToCss(colors[1].r, colors[1].g, colors[1].b, 0.95));
  root.style.setProperty("--orb-c3", rgbToCss(colors[2].r, colors[2].g, colors[2].b, 0.92));
  root.style.setProperty("--orb-c4", rgbToCss(colors[3].r, colors[3].g, colors[3].b, 0.90));

  // Glow: blend the brightest-ish color
  const glow = colors[1] || colors[0];
  root.style.setProperty("--orb-glow", rgbToCss(glow.r, glow.g, glow.b, 0.22));
}

export const CircularCover = ({
  src,
  alt,
  size = "md",
  showGlow = false,
  className,
}: CircularCoverProps) => {
  const hasSrc = Boolean(src && String(src).trim().length > 0);

  useEffect(() => {
    const url = String(src || "").trim();
    if (!url) return;

    let cancelled = false;

    (async () => {
      try {
        const colors = await extractPaletteFromImageUrl(url);
        if (cancelled) return;
        setOrbCssVars(colors);
      } catch (e) {
        // If CORS taints canvas or any failure, keep defaults (Orb still visible)
        console.warn("Palette extraction failed:", String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className={cn("relative", sizeClasses[size], className)}>
      {showGlow && (
        <div className="absolute -inset-2.5 rounded-full opacity-50 blur-xl animate-pulse-glow bg-linear-to-r from-primary via-accent to-primary" />
      )}

      <div className="cover-circle w-full h-full">
        {hasSrc ? (
          <img
            src={String(src)}
            alt={alt}
            className="w-full h-full object-cover"
            // helps if the server sends proper CORS
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-foreground-muted text-xs">
            No cover
          </div>
        )}
      </div>
    </div>
  );
};