/** Colours identifying each car in a race. Chosen to stay distinguishable on the
 * dark background and from each other. The Tailwind class names are spelled out
 * so the compiler can see them; building them by interpolation would leave the
 * classes out of the generated stylesheet. */
export const RACE_COLORS = [
  { hex: "#34d399", text: "text-emerald-400", bg: "bg-emerald-400", ring: "ring-emerald-500", border: "border-emerald-500" },
  { hex: "#60a5fa", text: "text-blue-400", bg: "bg-blue-400", ring: "ring-blue-500", border: "border-blue-500" },
  { hex: "#fbbf24", text: "text-amber-400", bg: "bg-amber-400", ring: "ring-amber-500", border: "border-amber-500" },
  { hex: "#f472b6", text: "text-pink-400", bg: "bg-pink-400", ring: "ring-pink-500", border: "border-pink-500" },
  { hex: "#a78bfa", text: "text-violet-400", bg: "bg-violet-400", ring: "ring-violet-500", border: "border-violet-500" },
  { hex: "#22d3ee", text: "text-cyan-400", bg: "bg-cyan-400", ring: "ring-cyan-500", border: "border-cyan-500" },
  { hex: "#fb923c", text: "text-orange-400", bg: "bg-orange-400", ring: "ring-orange-500", border: "border-orange-500" },
  { hex: "#a3e635", text: "text-lime-400", bg: "bg-lime-400", ring: "ring-lime-500", border: "border-lime-500" },
] as const;

export const MAX_RACERS = RACE_COLORS.length;

export function raceColor(index: number) {
  return RACE_COLORS[index % RACE_COLORS.length];
}

export interface RacerProgress {
  carId: string;
  /** Slot in the starting grid, which fixes the car's colour. Deliberately not
   * the live position - a car must keep its colour when it is overtaken. */
  gridIndex: number;
  /** Metres covered at the current playback moment. */
  distanceM: number;
  speedKph: number;
  /** The car's simulated lap time, known up front. */
  totalTimeMs: number;
  /** Time on this car's clock right now: running while it drives, frozen at its
   * lap time the moment it crosses the line. */
  elapsedMs: number;
  /** Whether the car has crossed the line at the current playback moment. */
  finished: boolean;
}

export interface RankedRacer extends RacerProgress {
  position: number;
  /** Metres behind the leader; 0 for the leader, null once ranked on time. */
  gapM: number | null;
  /** Milliseconds behind the winner, once both have finished. */
  gapMs: number | null;
}

/** Orders the field the way a race does: cars that have crossed the line are
 * ahead of cars still running and are ranked by their time, while everyone
 * still on track is ranked by how far they have come. */
export function rankRacers(racers: RacerProgress[]): RankedRacer[] {
  const ordered = [...racers].sort((a, b) => {
    if (a.finished && b.finished) return a.totalTimeMs - b.totalTimeMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.distanceM - a.distanceM;
  });

  const leader = ordered[0];
  return ordered.map((racer, i) => ({
    ...racer,
    position: i + 1,
    gapM: leader && !(racer.finished && leader.finished) ? leader.distanceM - racer.distanceM : null,
    gapMs: leader && racer.finished && leader.finished ? racer.totalTimeMs - leader.totalTimeMs : null,
  }));
}

/** How long the replay runs. Every car shares one clock so a faster car visibly
 * pulls away, which means the slowest car sets the length - compressed, or a
 * 17-minute hillclimb would be unwatchable. */
export function playbackDurationMs(slowestTimeMs: number): number {
  return Math.min(15000, Math.max(4000, slowestTimeMs / 50));
}

export function formatGap(racer: RankedRacer): string {
  if (racer.position === 1) return "—";
  if (racer.gapMs !== null) return `+${(racer.gapMs / 1000).toFixed(2)}s`;
  if (racer.gapM !== null) return `+${Math.round(racer.gapM)} m`;
  return "";
}
