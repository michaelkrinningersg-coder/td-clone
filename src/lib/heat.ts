/** A green-to-red scale for "how good is this, really".
 *
 * One scale for every judgement on the car page, so a colour means the same
 * thing wherever it appears: dark green is as good as it gets, dark red as bad.
 * The stops run through light green, yellow and orange in between, because a
 * two-colour ramp turns everything mediocre into an indistinct brown. */
const STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [20, 83, 45] }, // dark green
  { at: 0.2, rgb: [74, 222, 128] }, // light green
  { at: 0.4, rgb: [250, 204, 21] }, // yellow
  { at: 0.6, rgb: [249, 115, 22] }, // orange
  { at: 0.8, rgb: [220, 38, 38] }, // red
  { at: 1, rgb: [127, 29, 29] }, // dark red
];

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour for a score, 0 being the best and 1 the worst. */
export function heatColor(score: number): string {
  const t = clamp01(score);
  for (let i = 1; i < STOPS.length; i++) {
    const to = STOPS[i];
    if (t > to.at) continue;
    const from = STOPS[i - 1];
    const f = (t - from.at) / (to.at - from.at);
    return hex([0, 1, 2].map((c) => from.rgb[c] + (to.rgb[c] - from.rgb[c]) * f) as [number, number, number]);
  }
  return hex(STOPS[STOPS.length - 1].rgb);
}

/** Black or white, whichever can be read on that colour. The mid-scale yellows
 * are far too bright for white text and the dark ends far too dark for black. */
export function readableOn(colorHex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(colorHex.slice(i, i + 2), 16) / 255);
  // Rec. 709 luminance, which is close enough for a decision this coarse.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "#18181b" : "#ffffff";
}

/** How good a lap is, measured against the best lap on that track.
 *
 * A relative gap rather than seconds, so a sprint and a circuit are judged on
 * the same scale. Everything a third off the record is as bad as the scale
 * goes - beyond that the difference stops being interesting. */
export const WORST_GAP = 1 / 3;

export function lapScore(timeMs: number, bestMs: number): number {
  if (!(bestMs > 0)) return 0;
  return clamp01((timeMs - bestMs) / bestMs / WORST_GAP);
}

/** How good a placing is, measured against the size of the field it was set
 * in. First is 0, last is 1; a field of one is a win. */
export function positionScore(position: number, fieldSize: number): number {
  if (fieldSize <= 1) return 0;
  return clamp01((position - 1) / (fieldSize - 1));
}
