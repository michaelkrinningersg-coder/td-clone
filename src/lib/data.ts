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

export const statMax = {
  topSpeedKph: Math.max(1, ...cars.map((c) => c.topSpeedKph)),
  powerPs: Math.max(1, ...cars.map((c) => c.powerPs)),
  weightKg: Math.max(1, ...cars.map((c) => c.weightKg)),
  torqueNm: Math.max(1, ...cars.map((c) => c.torqueNm)),
  accel0to100s: Math.max(1, ...cars.map((c) => c.accel0to100s)),
};
