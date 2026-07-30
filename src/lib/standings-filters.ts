import type { CarData, TrackData } from "@/lib/data";
import { carClassOf } from "@/lib/classes";

/** What a track asks of a car, which is not the same as how it is drawn.
 *
 * A drag strip and a banked oval are both a question of power against drag with
 * no real braking zone anywhere; a road circuit is a question of everything.
 * Grouping the boards this way is the only honest way to compare a diesel
 * estate against a hypercar - one of them wins something. */
export type TrackGroup = "straight" | "oval" | "circuit";

/** Tightest corner on a lap that still counts as an oval. Above this radius
 * nothing on the lap needs the brakes, which is what an oval is. */
const OVAL_MIN_RADIUS_M = 150;

export function trackGroupOf(track: Pick<TrackData, "type" | "speedTest" | "segments">): TrackGroup {
  if (track.type === "SPRINT" || track.speedTest) return "straight";
  const corners = track.segments.filter((s) => s.kind === "corner");
  if (corners.length === 0) return "straight";
  const tightest = Math.min(...corners.map((s) => (s.kind === "corner" ? s.radiusM : Infinity)));
  return tightest >= OVAL_MIN_RADIUS_M ? "oval" : "circuit";
}

/** How the boards may be sliced by track. The middle one is the useful pair:
 * everywhere a car only has to go in a straight line, oval included. */
export type TrackScope = "all" | "power" | "circuit";

export const TRACK_SCOPES: { id: TrackScope; label: string; hint: string }[] = [
  { id: "all", label: "Alle Strecken", hint: "Jede Strecke zählt gleich." },
  {
    id: "power",
    label: "Geradeaus & Ovale",
    hint: "Sprints, Beschleunigungs- und Bremstests und die Ovale — überall, wo kaum gebremst und nie eingelenkt wird.",
  },
  {
    id: "circuit",
    label: "Rundstrecken",
    hint: "Die echten Rundkurse: bremsen, einlenken, wieder heraus beschleunigen.",
  },
];

export function trackInScope(
  track: Pick<TrackData, "type" | "speedTest" | "segments">,
  scope: TrackScope,
): boolean {
  if (scope === "all") return true;
  const group = trackGroupOf(track);
  return scope === "circuit" ? group === "circuit" : group !== "circuit";
}

/** What a board may be narrowed to on the car side. Every one of these reads a
 * field the dataset carries for every car - nothing is inferred. */
export interface CarScope {
  /** Marque exactly as the field spells it, or "" for all. */
  make: string;
  /** Class id from `carClasses`, or "" for all. */
  classId: string;
  /** "FWD" | "RWD" | "AWD", or "" for all. */
  drivetrain: string;
  /** Fuel type exactly as the dataset spells it, or "" for all. */
  fuelType: string;
}

export const EMPTY_CAR_SCOPE: CarScope = { make: "", classId: "", drivetrain: "", fuelType: "" };

export function carInScope(car: CarData | undefined, scope: CarScope): boolean {
  // A time whose car is no longer in the field cannot be checked against any of
  // these, so it drops out as soon as one of them is set.
  if (!car) return carScopeIsEmpty(scope);
  if (scope.make && car.make !== scope.make) return false;
  if (scope.classId && carClassOf(car).id !== scope.classId) return false;
  if (scope.drivetrain && car.drivetrain !== scope.drivetrain) return false;
  if (scope.fuelType && car.fuelType !== scope.fuelType) return false;
  return true;
}

export function carScopeIsEmpty(scope: CarScope): boolean {
  return !scope.make && !scope.classId && !scope.drivetrain && !scope.fuelType;
}

/** Marques present in the field, alphabetically - the picker should offer what
 * exists rather than a list somebody wrote down. */
export function makesIn(cars: readonly CarData[]): string[] {
  return [...new Set(cars.map((c) => c.make))].sort((a, b) => a.localeCompare(b));
}

/** Fuel types actually present in the field, most common first - the picker
 * should offer what exists rather than a list somebody wrote down. */
export function fuelTypesIn(cars: readonly CarData[]): string[] {
  const counts = new Map<string, number>();
  for (const car of cars) counts.set(car.fuelType, (counts.get(car.fuelType) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f]) => f);
}

export interface MakeRecordCount {
  make: string;
  records: number;
}

/** Which marque holds how many track records, most first.
 *
 * Counted from the records themselves rather than from the standings: a marque
 * with one untouchable car and nothing else is a different story from one that
 * is quick everywhere, and only this table tells them apart. */
export function makeRecordCounts(
  records: readonly { make: string | undefined }[],
): MakeRecordCount[] {
  const counts = new Map<string, number>();
  for (const { make } of records) {
    if (!make) continue;
    counts.set(make, (counts.get(make) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([make, records]) => ({ make, records }))
    .sort((a, b) => b.records - a.records || a.make.localeCompare(b.make));
}

export interface CarRecordCount<T> {
  car: T;
  records: number;
}

/** Which cars hold the most track records, most first.
 *
 * The marque tally answers "which badge is quickest"; this answers "which
 * single car is". They are not the same story - a marque can lead on breadth
 * while one rival car outright holds more boards than anything it builds.
 *
 * Generic in the car so the ranking does not have to know what a car is: it
 * counts by identity and hands back whatever it was given. Ties break on the
 * id, so the podium does not reshuffle itself between renders. */
export function carRecordCounts<T extends { id: string }>(
  records: readonly { car: T | undefined }[],
): CarRecordCount<T>[] {
  const counts = new Map<string, { car: T; records: number }>();
  for (const { car } of records) {
    if (!car) continue;
    const entry = counts.get(car.id);
    if (entry) entry.records++;
    else counts.set(car.id, { car, records: 1 });
  }
  return [...counts.values()].sort((a, b) => b.records - a.records || a.car.id.localeCompare(b.car.id));
}
