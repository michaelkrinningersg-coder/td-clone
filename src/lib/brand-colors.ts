/** A stable colour per marque, used where cars are browsed and compared rather
 * than raced. In a race the colours come from the starting grid instead - two
 * cars of the same marque have to stay apart on the track.
 *
 * 107 marques is too many to hand-pick, so the colour is derived from the name.
 * That keeps it stable without a list to maintain, and a handful of marques
 * whose colour everyone knows are named explicitly. */

const KNOWN: Record<string, string> = {
  ferrari: "#ef4444",
  lamborghini: "#eab308",
  mclaren: "#f97316",
  bugatti: "#3b82f6",
  lotus: "#22c55e",
  "aston martin": "#14b8a6",
  "mercedes-benz": "#a1a1aa",
  "mercedes-amg": "#4ade80",
  bmw: "#60a5fa",
  porsche: "#f43f5e",
  subaru: "#818cf8",
  volvo: "#38bdf8",
};

/** Saturation and lightness vary in small steps alongside the hue. Hue alone is
 * not enough: with a hundred marques on one colour wheel, names whose hashes
 * land close together come out as near-identical shades - Honda, Volkswagen and
 * Citroen all arrived as the same green. The steps stay inside a range that
 * remains legible on the dark background. */
const SATURATIONS = [55, 67, 79];
const LIGHTNESSES = [58, 66, 74];

export function brandColor(make: string): string {
  const known = KNOWN[make.trim().toLowerCase()];
  if (known) return known;

  let hash = 0;
  for (let i = 0; i < make.length; i++) {
    hash = (hash * 31 + make.charCodeAt(i)) >>> 0;
  }
  const saturation = SATURATIONS[(hash >>> 9) % SATURATIONS.length];
  const lightness = LIGHTNESSES[(hash >>> 17) % LIGHTNESSES.length];
  return `hsl(${hash % 360} ${saturation}% ${lightness}%)`;
}
