import type { Segment } from "@/lib/track-types";

export type Point = [number, number];

/** A stretch of the lap that runs at a constant gradient, given as the fraction
 * of the lap it covers. OpenStreetMap carries no elevation, so these are set by
 * hand from the circuits' known profiles - the only part of a circuit that is
 * not measured. */
export interface GradientBand {
  from: number;
  to: number;
  percent: number;
}

const TWO_PI = Math.PI * 2;

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) total += distance(points[i], points[(i + 1) % points.length]);
  return total;
}

/** Walks the closed outline at a fixed step, so every later measurement is
 * taken over the same distance rather than over whatever spacing the survey
 * happened to have. */
export function resample(points: Point[], stepM: number): Point[] {
  const total = polylineLength(points);
  const count = Math.max(8, Math.round(total / stepM));
  const step = total / count;
  const out: Point[] = [];
  let leg = 0;
  let walked = 0;
  let along = 0;

  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (leg < points.length) {
      const a = points[leg];
      const b = points[(leg + 1) % points.length];
      const legLength = distance(a, b);
      if (walked + legLength >= target || leg === points.length - 1) {
        along = target - walked;
        const t = legLength > 0 ? along / legLength : 0;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      walked += legLength;
      leg++;
    }
  }
  return out;
}

/** Radius of the circle through three points - infinite where they are in line. */
function circumradius(a: Point, b: Point, c: Point): number {
  const ab = distance(a, b);
  const bc = distance(b, c);
  const ca = distance(c, a);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  if (area2 < 1e-9) return Number.POSITIVE_INFINITY;
  return (ab * bc * ca) / (2 * area2);
}

function headingAt(samples: Point[], i: number): number {
  const a = samples[(i - 1 + samples.length) % samples.length];
  const b = samples[(i + 1) % samples.length];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function normalise(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= TWO_PI;
  while (a < -Math.PI) a += TWO_PI;
  return a;
}

export interface PolylineOptions {
  /** Distance between samples. */
  stepM?: number;
  /** How far either side of a sample the curvature is measured over. Too short
   * and the survey's own jitter reads as corners; too long and a chicane is
   * smoothed into a straight. Fifteen metres is what keeps Monza's Rettifilo at
   * the 25 m radius it has instead of rounding it off to 70. */
  windowM?: number;
  /** Anything turning more gently than this counts as a straight. */
  straightRadiusM?: number;
  /** Straights shorter than this are folded into the segment before them, so
   * the simulation is not stepping through two-metre slivers. */
  minSegmentM?: number;
  /** And a corner shorter than this is folded into the corner beside it when
   * they turn the same way - the scrap a survey leaves when it wobbles across a
   * radius band, rather than a piece of road. */
  minCornerBandM?: number;
  gradients?: GradientBand[];
}

function gradientAt(fraction: number, bands: GradientBand[] | undefined): number {
  if (!bands) return 0;
  for (const band of bands) if (fraction >= band.from && fraction < band.to) return band.percent;
  return 0;
}

/** Turns a surveyed centreline into the straights and corners the simulation
 * drives.
 *
 * Curvature is measured along the line rather than assumed at hand-placed
 * vertices, so the radius a car corners on is the radius the road actually has.
 * A run of samples curving tighter than `straightRadiusM` becomes one corner,
 * and its radius comes out of the arc itself - the distance covered divided by
 * the heading it turned through - rather than from averaging noisy samples. */
export function polylineToSegments(points: Point[], options: PolylineOptions = {}): Segment[] {
  const {
    stepM = 5,
    windowM = 15,
    straightRadiusM = 400,
    minSegmentM = 12,
    minCornerBandM = 15,
    gradients,
  } = options;

  const samples = resample(points, stepM);
  const n = samples.length;
  if (n < 8) return [];
  const step = polylineLength(points) / n;
  const window = Math.max(1, Math.round(windowM / step));

  // Each sample is a straight, or a direction together with how tight it is.
  //
  // Direction has to be part of the class: a chicane grouped as one corner
  // would have its right and its left cancel out, and the arc would come back
  // with the radius of a fast kink instead of the two tight corners it is.
  //
  // Tightness has to be part of it as well, and that is the newer half. A
  // corner that winds from a two-hundred-metre entry down to a forty-metre
  // apex is not one corner of a hundred and twenty: the car arrives quickly,
  // slows through it and picks the throttle up on the way out. Grouped as a
  // single mean radius it becomes a constant-speed arc that starts and ends
  // abruptly, with no entry to brake into and no exit to accelerate out of -
  // which is exactly the part of a lap where the tyres' one grip budget is
  // being spent on two things at once. Banding the radius geometrically keeps
  // a genuinely constant corner in one piece while letting a tightening one
  // come apart into the arcs it is really made of.
  const BAND_RATIO = 1.6; // at most about a quarter's radius spread inside a band
  const bandOf = (radius: number) => Math.round(Math.log(radius) / Math.log(BAND_RATIO));

  type Klass = string;
  const classes: Klass[] = samples.map((_, i) => {
    const radius = circumradius(samples[(i - window + n) % n], samples[i], samples[(i + window) % n]);
    if (radius >= straightRadiusM) return "straight";
    const turn = normalise(
      headingAt(samples, (i + window) % n) - headingAt(samples, (i - window + n) % n),
    );
    return `${turn < 0 ? "right" : "left"}:${bandOf(radius)}`;
  });

  interface Run {
    klass: Klass;
    from: number;
    to: number;
  }
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const last = runs[runs.length - 1];
    if (last && last.klass === classes[i]) last.to = i;
    else runs.push({ klass: classes[i], from: i, to: i });
  }
  // The lap is a loop, so a run that wraps past the end is the same run.
  if (runs.length > 1 && runs[0].klass === runs[runs.length - 1].klass) {
    runs[0].from = runs[runs.length - 1].from - n;
    runs.pop();
  }

  const segments: Segment[] = [];
  for (const run of runs) {
    const count = run.to - run.from + 1;
    const lengthM = count * step;

    let turn = 0;
    for (let i = run.from; i < run.to; i++) {
      turn += normalise(headingAt(samples, (i + 1 + n) % n) - headingAt(samples, (i + n) % n));
    }

    const midFraction = (((run.from + run.to) / 2 + n) % n) / n;
    const gradientPercent = gradientAt(midFraction, gradients);

    if (!run.klass.startsWith("straight") && Math.abs(turn) > 1e-6) {
      segments.push({
        kind: "corner",
        lengthM,
        // The arc's own radius: how far it ran divided by how far it turned.
        radiusM: lengthM / Math.abs(turn),
        dir: turn < 0 ? "right" : "left",
        gradientPercent,
      });
    } else {
      segments.push({ kind: "straight", lengthM, gradientPercent });
    }
  }

  return mergeShort(mergeCornerSlivers(segments, minCornerBandM), minSegmentM);
}

/** Folds a corner shorter than `minLengthM` into the corner beside it, when
 * they turn the same way.
 *
 * Banding the radius makes a tightening corner come apart into the arcs it is
 * made of, which is the point - but a survey that wobbles across a band
 * boundary would also produce three-metre scraps that are noise rather than
 * road. Combined by arc, so the pair keeps both its length and the angle it
 * turns through: the radius of the whole is how far it ran over how far it
 * turned, exactly as a single run would have given. */
function mergeCornerSlivers(segments: Segment[], minLengthM: number): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    const mergeable =
      segment.kind === "corner" &&
      previous?.kind === "corner" &&
      previous.dir === segment.dir &&
      Math.min(previous.lengthM, segment.lengthM) < minLengthM;
    if (!mergeable) {
      out.push({ ...segment });
      continue;
    }
    const turned = previous.lengthM / previous.radiusM + segment.lengthM / segment.radiusM;
    previous.lengthM += segment.lengthM;
    previous.radiusM = previous.lengthM / turned;
  }
  return out;
}

/** Folds away the scraps of straight left between corners, keeping the lap's
 * total length.
 *
 * Only straights are folded. A ten-metre corner is the tightest part of a
 * chicane and the whole reason the car has to slow down; a ten-metre straight
 * between two corners is a rounding artefact. Folding both would quietly turn
 * Monza's Rettifilo into a fast kink. */
function mergeShort(segments: Segment[], minLengthM: number): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    if (segment.kind === "corner" || segment.lengthM >= minLengthM || !previous) {
      out.push({ ...segment });
      continue;
    }
    previous.lengthM += segment.lengthM;
  }
  // Two neighbours of the same kind can be left behind by the fold above.
  const joined: Segment[] = [];
  for (const segment of out) {
    const previous = joined[joined.length - 1];
    if (previous && previous.kind === "straight" && segment.kind === "straight") {
      previous.lengthM += segment.lengthM;
      continue;
    }
    joined.push(segment);
  }
  return joined;
}

/** Rotates the outline so the lap begins where the longest straight begins.
 *
 * The surveyed way starts wherever the mapper happened to start drawing. The
 * start line is not in the data, but every one of these circuits has its line
 * on its longest straight, which is close enough to put the lap's beginning in
 * a sensible place - and it decides where the sector boundaries fall. */
export function startAtLongestStraight(points: Point[], options: PolylineOptions = {}): Point[] {
  const segments = polylineToSegments(points, options);
  if (segments.length === 0) return points;

  let best = { index: 0, lengthM: -1 };
  let distanceSoFar = 0;
  for (const segment of segments) {
    if (segment.kind === "straight" && segment.lengthM > best.lengthM) {
      best = { index: distanceSoFar, lengthM: segment.lengthM };
    }
    distanceSoFar += segment.lengthM;
  }

  // Start a little way into the straight, where a start line usually sits.
  return rotateToDistance(points, best.index + best.lengthM * 0.3);
}

/** Re-cuts the closed outline so it begins `distanceM` along from where it did. */
export function rotateToDistance(points: Point[], distanceM: number): Point[] {
  const total = polylineLength(points);
  const target = ((distanceM % total) + total) % total;
  const out: Point[] = [];
  let walked = 0;
  let startIndex = 0;
  let startPoint: Point = points[0];

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const legLength = distance(a, b);
    if (walked + legLength > target) {
      const t = (target - walked) / legLength;
      startPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      startIndex = i + 1;
      break;
    }
    walked += legLength;
  }

  out.push(startPoint);
  for (let i = 0; i < points.length; i++) out.push(points[(startIndex + i) % points.length]);
  return out;
}
