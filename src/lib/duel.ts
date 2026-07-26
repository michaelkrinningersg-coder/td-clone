import type { CarData, TrackData } from "@/lib/data";
import { pickRandom } from "@/lib/random-grid";

/** Cars each marque fields in a duel. */
export const DUEL_TEAM_SIZE = 5;

/** Rounds a duel runs over. */
export const DUEL_ROUNDS = 3;

/** The five a marque sends: its most powerful cars, one per model so a duel is
 * not five versions of the same 911. */
export function duelTeam(cars: readonly CarData[], make: string, size = DUEL_TEAM_SIZE): CarData[] {
  const byPower = cars.filter((c) => c.make === make).sort((a, b) => b.powerPs - a.powerPs);
  const team: CarData[] = [];
  const models = new Set<string>();
  for (const car of byPower) {
    if (models.has(car.model)) continue;
    models.add(car.model);
    team.push(car);
    if (team.length === size) break;
  }
  // A marque with fewer distinct models than places falls back to filling up
  // with what is left rather than turning up short.
  if (team.length < size) {
    for (const car of byPower) {
      if (team.includes(car)) continue;
      team.push(car);
      if (team.length === size) break;
    }
  }
  return team;
}

export function duelCalendar(
  tracks: readonly TrackData[],
  rounds = DUEL_ROUNDS,
  random: () => number = Math.random,
): TrackData[] {
  return pickRandom(tracks, Math.min(rounds, tracks.length), random);
}

export interface DuelCarResult {
  carId: string;
  make: string;
  timeMs: number;
}

export interface DuelRoundResult {
  trackId: string;
  results: DuelCarResult[];
}

export interface DuelScore {
  make: string;
  /** Rounds this marque took, i.e. had the quicker team on the day. */
  roundsWon: number;
  /** Head-to-head places: how often one of its cars beat one of the other's. */
  duelsWon: number;
  /** Sum of the team's times, for the tie-break and for showing the margin. */
  totalTimeMs: number;
  /** Quickest single time the marque set. */
  bestTimeMs: number | null;
}

/** Scores a duel between two marques.
 *
 * A round goes to the marque with the lower team total on that track, which is
 * what makes it a team contest rather than five separate races: one runaway car
 * cannot carry a marque whose other four are nowhere.
 *
 * The head-to-head count is kept alongside because it says something the totals
 * do not - a marque can lose every round narrowly while its cars beat the
 * other's more often than not. */
export function duelScores(makes: [string, string], rounds: readonly DuelRoundResult[]): DuelScore[] {
  const scores: DuelScore[] = makes.map((make) => ({
    make,
    roundsWon: 0,
    duelsWon: 0,
    totalTimeMs: 0,
    bestTimeMs: null,
  }));
  const byMake = new Map(scores.map((s) => [s.make, s]));

  for (const round of rounds) {
    const totals = new Map<string, number>(makes.map((m) => [m, 0]));
    for (const result of round.results) {
      const score = byMake.get(result.make);
      if (!score) continue;
      score.totalTimeMs += result.timeMs;
      score.bestTimeMs = score.bestTimeMs === null ? result.timeMs : Math.min(score.bestTimeMs, result.timeMs);
      totals.set(result.make, (totals.get(result.make) ?? 0) + result.timeMs);
    }

    // Every car against every car of the other marque.
    const [a, b] = makes;
    const carsOfA = round.results.filter((r) => r.make === a);
    const carsOfB = round.results.filter((r) => r.make === b);
    for (const carA of carsOfA) {
      for (const carB of carsOfB) {
        if (carA.timeMs < carB.timeMs) byMake.get(a)!.duelsWon += 1;
        else if (carB.timeMs < carA.timeMs) byMake.get(b)!.duelsWon += 1;
      }
    }

    // A round is only awarded when both marques actually ran it.
    if (carsOfA.length > 0 && carsOfB.length > 0) {
      const totalA = totals.get(a)!;
      const totalB = totals.get(b)!;
      if (totalA < totalB) byMake.get(a)!.roundsWon += 1;
      else if (totalB < totalA) byMake.get(b)!.roundsWon += 1;
    }
  }

  return scores;
}

/** The marque ahead, or null while it is level. */
export function duelLeader(scores: DuelScore[]): DuelScore | null {
  const [a, b] = scores;
  if (!a || !b) return null;
  if (a.roundsWon !== b.roundsWon) return a.roundsWon > b.roundsWon ? a : b;
  if (a.duelsWon !== b.duelsWon) return a.duelsWon > b.duelsWon ? a : b;
  if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs < b.totalTimeMs ? a : b;
  return null;
}
