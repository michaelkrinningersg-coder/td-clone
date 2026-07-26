import type { TimeEntryData } from "@/lib/time-store";

/** A car's record across every track it has run.
 *
 * Ranking by summed lap times would be meaningless: a car that only ever ran
 * the 250 m sprint would beat one that has done Pikes Peak. What counts is how
 * a car placed against the field on each track it entered, so the standing is
 * built from positions, not seconds. */
export interface CarStanding {
  carId: string;
  /** Points, best first. */
  points: number;
  /** Tracks this car holds a time on. */
  raced: number;
  wins: number;
  podiums: number;
  /** Mean finishing position, for breaking ties on points. */
  averagePosition: number;
  /** Mean shortfall against the best time on each track, as a percentage. */
  averageGapPercent: number;
}

/** Points for a placing, in the shape used by most racing series: a steep drop
 * over the first few places, then a long tail. Anything past tenth scores one
 * point for turning up. */
const POINTS_BY_POSITION = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function pointsForPosition(position: number): number {
  return POINTS_BY_POSITION[position - 1] ?? 1;
}

/** Builds the standings from every recorded time, grouped by track. */
export function buildStandings(entries: TimeEntryData[]): CarStanding[] {
  const byTrack = new Map<string, TimeEntryData[]>();
  for (const entry of entries) {
    const list = byTrack.get(entry.trackId);
    if (list) list.push(entry);
    else byTrack.set(entry.trackId, [entry]);
  }

  const totals = new Map<
    string,
    { points: number; raced: number; wins: number; podiums: number; positions: number; gaps: number }
  >();

  for (const trackEntries of byTrack.values()) {
    const ranked = [...trackEntries].sort((a, b) => a.timeMs - b.timeMs);
    const best = ranked[0].timeMs;

    ranked.forEach((entry, index) => {
      const position = index + 1;
      const current = totals.get(entry.carId) ?? {
        points: 0,
        raced: 0,
        wins: 0,
        podiums: 0,
        positions: 0,
        gaps: 0,
      };
      current.points += pointsForPosition(position);
      current.raced += 1;
      if (position === 1) current.wins += 1;
      if (position <= 3) current.podiums += 1;
      current.positions += position;
      current.gaps += best > 0 ? ((entry.timeMs - best) / best) * 100 : 0;
      totals.set(entry.carId, current);
    });
  }

  return Array.from(totals.entries())
    .map(([carId, t]) => ({
      carId,
      points: t.points,
      raced: t.raced,
      wins: t.wins,
      podiums: t.podiums,
      averagePosition: t.positions / t.raced,
      averageGapPercent: t.gaps / t.raced,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.averagePosition - b.averagePosition ||
        a.averageGapPercent - b.averageGapPercent,
    );
}
