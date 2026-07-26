/** How many cars make up a championship field. */
export const CHAMPIONSHIP_SIZE = 30;

/** Points for a placing in a championship round.
 *
 * A scale of its own, not the one the leaderboards use: a field of thirty
 * scores thirty down to one, so a place gained is a point and the whole field
 * fits in numbers anyone can hold in their head. The top score follows the
 * field, which keeps the last car on one point whatever the size. */
export function championshipPoints(position: number, fieldSize: number): number {
  if (position < 1 || position > fieldSize) return 0;
  return fieldSize + 1 - position;
}

/** How many run in one heat. A field of thirty on a single map is unreadable,
 * so a round is broken into heats and the track result is assembled from all of
 * them afterwards. Six is what the racing colours can tell apart. */
export const HEAT_SIZE = 6;

export interface HeatResult {
  carId: string;
  timeMs: number;
}

export interface RoundResult {
  trackId: string;
  /** Every car's time on this track, in the order they were driven. */
  results: HeatResult[];
}

export interface ChampionshipState {
  carIds: string[];
  trackIds: string[];
  /** Rounds already completed, in calendar order. */
  rounds: RoundResult[];
  /** Which heat of the current round comes next. */
  heatIndex: number;
  /** Times collected for the round in progress, heat by heat. */
  pending: HeatResult[];
}

/** Splits a field into heats of at most `size`, in the order given.
 *
 * The order is the caller's: the setup screen hands over the grid as picked,
 * and later rounds hand over the standings, so the leaders meet each other. */
export function splitIntoHeats<T>(field: readonly T[], size = HEAT_SIZE): T[][] {
  const heats: T[][] = [];
  for (let i = 0; i < field.length; i += size) heats.push(field.slice(i, i + size));
  return heats;
}

export interface ChampionshipStanding {
  carId: string;
  points: number;
  /** Rounds this car has a result in. */
  rounds: number;
  wins: number;
  podiums: number;
  bestPosition: number;
  /** Position in the last completed round, or null before the first. */
  lastPosition: number | null;
  totalTimeMs: number;
}

/** The championship table after the rounds completed so far.
 *
 * A round is scored across the whole field, not per heat: which six a car
 * happened to run with must not decide its points, so all thirty times are
 * ranked together once the round is complete. */
export function championshipStandings(
  carIds: readonly string[],
  rounds: readonly RoundResult[],
): ChampionshipStanding[] {
  const totals = new Map<string, ChampionshipStanding>(
    carIds.map((carId) => [
      carId,
      {
        carId,
        points: 0,
        rounds: 0,
        wins: 0,
        podiums: 0,
        bestPosition: Number.POSITIVE_INFINITY,
        lastPosition: null,
        totalTimeMs: 0,
      },
    ]),
  );

  for (const round of rounds) {
    const ranked = [...round.results].sort((a, b) => a.timeMs - b.timeMs);
    ranked.forEach((result, index) => {
      const standing = totals.get(result.carId);
      if (!standing) return; // a car that is not in this championship
      const position = index + 1;
      standing.points += championshipPoints(position, ranked.length);
      standing.rounds += 1;
      if (position === 1) standing.wins += 1;
      if (position <= 3) standing.podiums += 1;
      standing.bestPosition = Math.min(standing.bestPosition, position);
      standing.lastPosition = position;
      standing.totalTimeMs += result.timeMs;
    });
  }

  return Array.from(totals.values()).sort(
    (a, b) => b.points - a.points || a.totalTimeMs - b.totalTimeMs || a.bestPosition - b.bestPosition,
  );
}

/** True once every round of the calendar has been driven. */
export function isFinished(state: ChampionshipState): boolean {
  return state.rounds.length >= state.trackIds.length;
}

/** The track the championship is on, or null when it is over. */
export function currentTrackId(state: ChampionshipState): string | null {
  return state.trackIds[state.rounds.length] ?? null;
}

/** The order the field is broken into heats in.
 *
 * Before the first round there is nothing to go on, so the grid order stands.
 * Afterwards the table decides, worst placed first: the opening heat is the
 * back of the championship and the last one is the top six fighting for it,
 * which is the way round that keeps the day building to something. */
export function heatOrder(state: ChampionshipState): string[] {
  if (state.rounds.length === 0) return state.carIds;
  return championshipStandings(state.carIds, state.rounds)
    .map((s) => s.carId)
    .reverse();
}

/** The cars of the heat coming up. */
export function currentHeat(state: ChampionshipState): string[] {
  return splitIntoHeats(heatOrder(state))[state.heatIndex] ?? [];
}

/** The championship positions the heat coming up is made of, e.g. "30.–25.".
 * Null before the first round, when the heats follow the grid instead. */
export function currentHeatPositions(state: ChampionshipState): { from: number; to: number } | null {
  if (state.rounds.length === 0) return null;
  const order = heatOrder(state);
  const heats = splitIntoHeats(order);
  const heat = heats[state.heatIndex];
  if (!heat) return null;
  // heatOrder runs backwards, so the first car of a heat is the worst placed.
  const firstIndex = heats.slice(0, state.heatIndex).reduce((n, h) => n + h.length, 0);
  return { from: order.length - firstIndex, to: order.length - firstIndex - heat.length + 1 };
}

export function heatCount(state: ChampionshipState): number {
  return splitIntoHeats(state.carIds).length;
}

/** Files a heat's times. When it was the round's last heat, the round is closed
 * and the championship moves on to the next track. */
export function recordHeat(state: ChampionshipState, results: HeatResult[]): ChampionshipState {
  const trackId = currentTrackId(state);
  if (trackId === null) return state;

  const pending = [...state.pending, ...results];
  const nextHeat = state.heatIndex + 1;
  if (nextHeat < heatCount(state)) {
    return { ...state, pending, heatIndex: nextHeat };
  }
  return {
    ...state,
    rounds: [...state.rounds, { trackId, results: pending }],
    pending: [],
    heatIndex: 0,
  };
}

export function newChampionship(carIds: string[], trackIds: string[]): ChampionshipState {
  return { carIds, trackIds, rounds: [], heatIndex: 0, pending: [] };
}
