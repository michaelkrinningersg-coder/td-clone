import carsJson from "@/data/cars.json";
import { tracks as trackDefs } from "@/data/tracks";
import { trackLengthM, type Segment } from "@/lib/track-types";
import { carSlug, trackSlug } from "@/lib/slug";
import type { Drivetrain } from "@/lib/physics";

/** Cars and tracks are immutable reference data, so both the SQLite path and the
 * static Pages build read them from these same seed files - there is no second
 * source of truth that could drift. Only lap times differ between the two modes. */

export interface CarData {
  id: string;
  make: string;
  model: string;
  year: number;
  topSpeedKph: number;
  accel0to100s: number;
  powerPs: number;
  weightKg: number;
  torqueNm: number;
  drivetrain: Drivetrain;
  fuelType: string;
}

export interface TrackData {
  id: string;
  name: string;
  type: "SPRINT" | "CIRCUIT";
  lengthM: number;
  segments: Segment[];
}

export const cars: CarData[] = (carsJson as Omit<CarData, "id">[])
  .map((car) => ({ ...car, id: carSlug(car) }))
  .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));

export const tracks: TrackData[] = trackDefs
  .map((track) => ({
    id: trackSlug(track),
    name: track.name,
    type: track.type,
    lengthM: trackLengthM(track.segments),
    segments: track.segments,
  }))
  .sort((a, b) => a.type.localeCompare(b.type) || a.lengthM - b.lengthM);

export function getCar(id: string): CarData | undefined {
  return cars.find((c) => c.id === id);
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
};

export type StatRanges = typeof statRanges;
