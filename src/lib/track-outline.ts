import type { Segment } from "@/lib/track-types";

/** A corner of the circuit, as a point on the map plus the radius the road
 * takes through it. */
export interface OutlineVertex {
  x: number;
  y: number;
  /** Radius of the arc driven through this corner, in metres. */
  radiusM: number;
  /** Gradient of the leg leaving this vertex, in percent. */
  gradientPercent?: number;
  /** Corner name, for the data to stay readable. */
  name?: string;
}

/** Turns a closed outline into the segment list the simulation drives.
 *
 * The circuits used to be written straight out as a list of straights and
 * corners, which is how a driver describes a lap but not how a track is shaped:
 * nothing tied the last corner back to the first, so a lap never came back to
 * where it started - Monaco turned through 588 degrees and finished 1.8 km from
 * the line. Describing the circuit as the closed shape it is and deriving the
 * segments from it turns that round. The drawing closes because the shape does,
 * and the corner radii the physics uses are the radii of the drawn line.
 *
 * Each vertex is rounded off by an arc tangent to both legs - the standard
 * fillet - so the road runs straight, curves through the corner at its radius
 * and leaves straight again. */
export function outlineToSegments(outline: OutlineVertex[]): Segment[] {
  const n = outline.length;
  if (n < 3) return [];

  const legs = outline.map((v, i) => {
    const next = outline[(i + 1) % n];
    return { dx: next.x - v.x, dy: next.y - v.y, length: Math.hypot(next.x - v.x, next.y - v.y) };
  });

  /** How far back from a corner the arc starts, and how much heading it sweeps. */
  const corners = outline.map((v, i) => {
    const incoming = legs[(i - 1 + n) % n];
    const outgoing = legs[i];
    const headingIn = Math.atan2(incoming.dy, incoming.dx);
    const headingOut = Math.atan2(outgoing.dy, outgoing.dx);
    let turn = headingOut - headingIn;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    const tangent = Math.abs(Math.tan(turn / 2)) * v.radiusM;
    return { turn, tangent };
  });

  // An arc that needs more room than the legs can give would eat into its
  // neighbours, so the radius is reduced until it fits rather than the shape
  // being distorted to suit it.
  const fitted = corners.map((corner, i) => {
    const before = legs[(i - 1 + n) % n].length;
    const after = legs[i].length;
    const room = Math.min(before, after) / 2;
    if (corner.tangent <= room || corner.tangent === 0) return corner;
    const scale = room / corner.tangent;
    return { turn: corner.turn, tangent: room, radiusM: outline[i].radiusM * scale };
  });

  const radiusOf = (i: number) =>
    "radiusM" in fitted[i] ? (fitted[i] as { radiusM: number }).radiusM : outline[i].radiusM;

  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const vertex = outline[i];
    const turn = fitted[i].turn;
    const radius = radiusOf(i);

    // The corner at this vertex, driven before the leg that leaves it.
    if (Math.abs(turn) > 1e-9 && radius > 0) {
      segments.push({
        kind: "corner",
        lengthM: Math.abs(turn) * radius,
        radiusM: radius,
        dir: turn < 0 ? "right" : "left",
        gradientPercent: vertex.gradientPercent ?? 0,
      });
    }

    // The straight from this corner's exit to the next corner's entry.
    const straight = legs[i].length - fitted[i].tangent - fitted[(i + 1) % n].tangent;
    if (straight > 1e-6) {
      segments.push({
        kind: "straight",
        lengthM: straight,
        gradientPercent: vertex.gradientPercent ?? 0,
      });
    }
  }
  return segments;
}

/** Scales an outline so the lap comes out at the length the real circuit has.
 *
 * The shapes are drawn by eye, so their raw size means nothing; the real length
 * does. Everything scales together - coordinates and radii - so the shape is
 * untouched and only the ruler changes. */
export function scaleOutline(outline: OutlineVertex[], targetLengthM: number): OutlineVertex[] {
  const current = outlineToSegments(outline).reduce((sum, s) => sum + s.lengthM, 0);
  if (current <= 0) return outline;
  const factor = targetLengthM / current;
  return outline.map((v) => ({
    ...v,
    x: v.x * factor,
    y: v.y * factor,
    radiusM: v.radiusM * factor,
  }));
}

/** Builds a closed circuit from an outline drawn by eye, at its real length. */
export function circuitFromOutline(outline: OutlineVertex[], lengthM: number): Segment[] {
  return outlineToSegments(scaleOutline(outline, lengthM));
}
