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

export interface CarResult {
  carId: string;
  timeMs: number;
}

export interface RoundResult {
  trackId: string;
  /** Every car's time on this track. */
  results: CarResult[];
}

export interface ChampionshipState {
  carIds: string[];
  trackIds: string[];
  /** Rounds already completed, in calendar order. */
  rounds: RoundResult[];
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

/** The order the field lines up in.
 *
 * The whole field starts together, so this only decides the grid slots - and
 * with them the racing colours. Before the first round the field is as picked;
 * afterwards the championship leader is on pole. */
export function gridOrder(state: ChampionshipState): string[] {
  if (state.rounds.length === 0) return state.carIds;
  return championshipStandings(state.carIds, state.rounds).map((s) => s.carId);
}

/** Files a round's times and moves the championship on to the next track. */
export function recordRound(state: ChampionshipState, results: CarResult[]): ChampionshipState {
  const trackId = currentTrackId(state);
  if (trackId === null) return state;
  return { ...state, rounds: [...state.rounds, { trackId, results }] };
}

export function newChampionship(carIds: string[], trackIds: string[]): ChampionshipState {
  return { carIds, trackIds, rounds: [] };
}
