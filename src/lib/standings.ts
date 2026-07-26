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
  /** Every recorded time added together. Only comparable between cars that
   * have run the same tracks - see `mixedTrackCounts`. */
  totalTimeMs: number;
}

/** How the table is ordered. Points reward placing on many tracks, the mean gap
 * asks how close a car gets to the best time, and the total is the raw sum of
 * seconds. */
export type StandingsOrder = "points" | "gap" | "time";

/** Points run in a straight line from the win down to nothing: the first place
 * scores 5000, every place after it exactly one less, and the 5000th still
 * takes a point home. Past that a car scores nothing.
 *
 * Every place is therefore worth the same one point, wherever it is won - a
 * car that climbs from 900th to 899th gains as much as one that takes a win off
 * the leader. */
const LAST_SCORING_POSITION = 5000;

export function pointsForPosition(position: number): number {
  if (position < 1 || position > LAST_SCORING_POSITION) return 0;
  return LAST_SCORING_POSITION + 1 - position;
}

/** Builds the standings from every recorded time, grouped by track. */
export function buildStandings(
  entries: TimeEntryData[],
  order: StandingsOrder = "points",
): CarStanding[] {
  const byTrack = new Map<string, TimeEntryData[]>();
  for (const entry of entries) {
    const list = byTrack.get(entry.trackId);
    if (list) list.push(entry);
    else byTrack.set(entry.trackId, [entry]);
  }

  const totals = new Map<
    string,
    {
      points: number;
      raced: number;
      wins: number;
      podiums: number;
      positions: number;
      gaps: number;
      timeMs: number;
    }
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
        timeMs: 0,
      };
      current.points += pointsForPosition(position);
      current.raced += 1;
      if (position === 1) current.wins += 1;
      if (position <= 3) current.podiums += 1;
      current.positions += position;
      current.gaps += best > 0 ? ((entry.timeMs - best) / best) * 100 : 0;
      current.timeMs += entry.timeMs;
      totals.set(entry.carId, current);
    });
  }

  const standings = Array.from(totals.entries()).map(([carId, t]) => ({
    carId,
    points: t.points,
    raced: t.raced,
    wins: t.wins,
    podiums: t.podiums,
    averagePosition: t.positions / t.raced,
    averageGapPercent: t.gaps / t.raced,
    totalTimeMs: t.timeMs,
  }));

  return sortStandings(standings, order);
}

/** Reorders a built table without recomputing it. */
export function sortStandings(standings: CarStanding[], order: StandingsOrder): CarStanding[] {
  const sorted = [...standings];
  if (order === "time") {
    // A car that has run more tracks carries more seconds, so on an equal total
    // the one that covered more ground is ahead.
    return sorted.sort((a, b) => a.totalTimeMs - b.totalTimeMs || b.raced - a.raced);
  }
  if (order === "gap") {
    return sorted.sort(
      (a, b) => a.averageGapPercent - b.averageGapPercent || b.raced - a.raced || b.points - a.points,
    );
  }
  return sorted.sort(
    (a, b) =>
      b.points - a.points ||
      a.averagePosition - b.averagePosition ||
      a.averageGapPercent - b.averageGapPercent,
  );
}

/** True when the cars have not all run the same number of tracks, which makes a
 * total-time comparison misleading. */
export function hasMixedTrackCounts(standings: CarStanding[]): boolean {
  return new Set(standings.map((s) => s.raced)).size > 1;
}
