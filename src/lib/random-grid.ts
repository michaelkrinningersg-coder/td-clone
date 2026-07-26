import type { CarData } from "@/lib/data";
import { carClassOf } from "@/lib/classes";

/** Draws a grid at random from a pool.
 *
 * Randomness is passed in rather than reached for, so a caller can seed it and
 * the tests can be deterministic. `Math.random` is the obvious argument in the
 * browser. */
export function pickRandom<T>(pool: readonly T[], count: number, random: () => number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < count && remaining.length > 0) {
    const index = Math.min(remaining.length - 1, Math.floor(random() * remaining.length));
    picked.push(remaining[index]);
    // Swap-and-pop: cheap removal and no car can be drawn twice.
    remaining[index] = remaining[remaining.length - 1];
    remaining.pop();
  }
  return picked;
}

export interface RandomGridOptions {
  /** How many cars to draw. Fewer come back when the pool is smaller. */
  count: number;
  /** Cars that already hold a time on the track in play, when they should be
   * left out. */
  excludeIds?: ReadonlySet<string>;
  /** Restricts the draw to one class, e.g. to fill a field around a car. */
  classId?: string;
  /** At most one car per marque, so a field is not four Audis. */
  onePerMake?: boolean;
  random?: () => number;
}

/** Builds a random grid from the cars offered, honouring the options in the
 * order they narrow the pool: class, then already-timed cars, then the one-per-
 * marque rule while drawing. */
export function randomGrid(pool: readonly CarData[], options: RandomGridOptions): CarData[] {
  const { count, excludeIds, classId, onePerMake, random = Math.random } = options;

  let candidates = pool;
  if (classId) candidates = candidates.filter((car) => carClassOf(car).id === classId);
  if (excludeIds && excludeIds.size > 0) candidates = candidates.filter((car) => !excludeIds.has(car.id));

  if (!onePerMake) return pickRandom(candidates, count, random);

  // Drawing one at a time and dropping the marque afterwards keeps every make
  // equally likely, which picking a make first would not.
  const picked: CarData[] = [];
  const usedMakes = new Set<string>();
  let remaining = [...candidates];
  while (picked.length < count && remaining.length > 0) {
    const [car] = pickRandom(remaining, 1, random);
    picked.push(car);
    usedMakes.add(car.make);
    remaining = remaining.filter((c) => !usedMakes.has(c.make));
  }
  return picked;
}

/** The field around a car: the car itself plus others drawn from its class.
 * Used by the championship, where one pick can become a whole grid. */
export function fieldAround(
  car: CarData,
  pool: readonly CarData[],
  size: number,
  options: Omit<RandomGridOptions, "count" | "classId"> = {},
): CarData[] {
  const rest = randomGrid(
    pool.filter((c) => c.id !== car.id),
    { ...options, count: size - 1, classId: carClassOf(car).id },
  );
  return [car, ...rest];
}
