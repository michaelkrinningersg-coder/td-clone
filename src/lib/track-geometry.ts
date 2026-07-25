import type { Segment } from "./track-types";

export interface PathPoint {
  distanceM: number;
  x: number;
  y: number;
}

export interface TrackPath {
  points: PathPoint[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Builds a stylized 2D top-down path from a segment list. Corner turn direction
 * isn't stored per segment (we only know radius/length), so corners alternate
 * left/right, which is enough to draw a plausible, readable circuit shape - this
 * is a stylization for the visualization, not a claim of exact real geometry. */
export function buildTrackPath(segments: Segment[], stepM = 5): TrackPath {
  const points: PathPoint[] = [{ distanceM: 0, x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  let heading = 0;
  let distanceSoFar = 0;
  let turnSign = 1;
  let minX = 0,
    maxX = 0,
    minY = 0,
    maxY = 0;

  for (const seg of segments) {
    const steps = Math.max(1, Math.round(seg.lengthM / stepM));
    const stepLen = seg.lengthM / steps;
    const stepAngle = seg.kind === "corner" ? ((seg.lengthM / seg.radiusM) / steps) * turnSign : 0;

    for (let i = 0; i < steps; i++) {
      heading += stepAngle / 2;
      x += Math.cos(heading) * stepLen;
      y += Math.sin(heading) * stepLen;
      heading += stepAngle / 2;
      distanceSoFar += stepLen;
      points.push({ distanceM: distanceSoFar, x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (seg.kind === "corner") turnSign *= -1;
  }

  return { points, minX, maxX, minY, maxY };
}

/** Linearly interpolated position + heading at a given distance along the path. */
export function pointAtDistance(path: TrackPath, distanceM: number): { x: number; y: number; heading: number } {
  const pts = path.points;
  if (distanceM <= pts[0].distanceM) return { x: pts[0].x, y: pts[0].y, heading: 0 };
  const last = pts[pts.length - 1];
  if (distanceM >= last.distanceM) {
    const prev = pts[pts.length - 2] ?? last;
    return { x: last.x, y: last.y, heading: Math.atan2(last.y - prev.y, last.x - prev.x) };
  }

  let lo = 0,
    hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distanceM <= distanceM) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const span = b.distanceM - a.distanceM;
  const t = span > 0 ? (distanceM - a.distanceM) / span : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    heading: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

export function toSvgPath(path: TrackPath): string {
  return path.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}
