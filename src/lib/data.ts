import carsJson from "@/data/cars.json";
import { tracks as trackDefs } from "@/data/tracks";
import { trackLengthM, type Segment } from "@/lib/track-types";
import { carSlug, slugify, trackSlug } from "@/lib/slug";
import type { Drivetrain } from "@/lib/physics";
import type { BrakeKind } from "@/lib/car-import";

/** Cars and tracks are immutable reference data, so both the SQLite path and the
 * static Pages build read them from these same seed files - there is no second
 * source of truth that could drift. Only lap times differ between the two modes. */

export interface CarData {
  id: string;
  make: string;
  model: string;
  /** Engine variant; several can exist per model year when they drive differently. */
  variant: string;
  year: number;
  topSpeedKph: number;
  accel0to100s: number;
  powerPs: number;
  weightKg: number;
  torqueNm: number;
  drivetrain: Drivetrain;
  fuelType: string;
  /** Drag coefficient plus the body dimensions the frontal area comes from. */
  dragCoefficient: number;
  widthMm: number;
  heightMm: number;
  brakeFront: BrakeKind;
  brakeRear: BrakeKind;
  tyreWidthMm: number;
  gearCount: number;
  manualGearbox: boolean;
}

export interface TrackData {
  id: string;
  name: string;
  type: "SPRINT" | "CIRCUIT";
  lengthM: number;
  segments: Segment[];
  /** The surveyed centreline, where there is one - see TrackDefinition. */
  outline?: [number, number][];
}

export const cars: CarData[] = (carsJson as Omit<CarData, "id">[])
  .map((car) => ({ ...car, id: carSlug(car) }))
  .sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      a.year - b.year ||
      a.variant.localeCompare(b.variant),
  );

export const tracks: TrackData[] = trackDefs
  .map((track) => ({
    id: trackSlug(track),
    name: track.name,
    type: track.type,
    lengthM: trackLengthM(track.segments),
    segments: track.segments,
    outline: track.outline,
  }))
  .sort((a, b) => a.type.localeCompare(b.type) || a.lengthM - b.lengthM);

export interface BrandData {
  /** URL-safe id, e.g. "mercedes-benz" */
  id: string;
  name: string;
  cars: CarData[];
  /** Shown on the brand tile to hint at what the marque offers. */
  maxPowerPs: number;
  yearFrom: number;
  yearTo: number;
}

const brandsById = new Map<string, BrandData>();
for (const car of cars) {
  const id = slugify(car.make);
  let brand = brandsById.get(id);
  if (!brand) {
    brand = { id, name: car.make, cars: [], maxPowerPs: 0, yearFrom: car.year, yearTo: car.year };
    brandsById.set(id, brand);
  }
  brand.cars.push(car);
  brand.maxPowerPs = Math.max(brand.maxPowerPs, car.powerPs);
  brand.yearFrom = Math.min(brand.yearFrom, car.year);
  brand.yearTo = Math.max(brand.yearTo, car.year);
}

export const brands: BrandData[] = Array.from(brandsById.values()).sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function getBrand(id: string): BrandData | undefined {
  return brandsById.get(id);
}

const carsById = new Map(cars.map((car) => [car.id, car]));

export function getCar(id: string): CarData | undefined {
  return carsById.get(id);
}

export function getCars(ids: string[]): CarData[] {
  return ids.map(getCar).filter((car): car is CarData => car !== undefined);
}

export function getTrack(id: string): TrackData | undefined {
  return tracks.find((t) => t.id === id);
}

export interface StatRange {
  min: number;
  max: number;
}

function rangeOf(pick: (car: CarData) => number): StatRange {
  if (cars.length === 0) return { min: 0, max: 1 };
  const values = cars.map(pick);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Bars on the car cards are scaled between the weakest and strongest car in the
 * field, not from zero. With thousands of cars spanning a 2CV to a hypercar, a
 * zero-based bar would squash every ordinary car into the same sliver. */
export const statRanges = {
  topSpeedKph: rangeOf((c) => c.topSpeedKph),
  powerPs: rangeOf((c) => c.powerPs),
  weightKg: rangeOf((c) => c.weightKg),
  torqueNm: rangeOf((c) => c.torqueNm),
  accel0to100s: rangeOf((c) => c.accel0to100s),
  year: rangeOf((c) => c.year),
  powerToWeight: rangeOf((c) => c.weightKg / c.powerPs),
};

/** Every decade the field covers, oldest first, so the filter offers exactly
 * what exists rather than a fixed list of decades. */
export const decades: number[] = Array.from(
  new Set(cars.map((c) => Math.floor(c.year / 10) * 10)),
).sort((a, b) => a - b);

/** Every fuel type present, so the filter offers exactly what exists. */
export const fuelTypes: string[] = Array.from(new Set(cars.map((c) => c.fuelType))).sort((a, b) =>
  a.localeCompare(b),
);

export type StatRanges = typeof statRanges;
