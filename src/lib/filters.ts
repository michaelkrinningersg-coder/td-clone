import type { CarData } from "@/lib/data";
import type { Drivetrain } from "@/lib/physics";
import { carClassOf, powerToWeight } from "@/lib/classes";

/** A bound of `null` means "no limit on this side", so a filter can be open at
 * one end without inventing a number. */
export type Range = { min: number | null; max: number | null };

export interface CarFilter {
  powerPs: Range;
  topSpeedKph: Range;
  accel0to100s: Range;
  year: Range;
  /** Kilograms per horsepower. */
  powerToWeight: Range;
  /** Class ids; empty means "any", like the other tick lists. */
  classes: string[];
  /** Empty means "any" rather than "none" - an empty set of ticks is the
   * unfiltered state, which is what an untouched filter panel shows. */
  drivetrains: Drivetrain[];
  fuelTypes: string[];
  /** Hides cars that already hold a time on the track being raced. */
  onlyWithoutTime: boolean;
}

export const EMPTY_RANGE: Range = { min: null, max: null };

export const EMPTY_FILTER: CarFilter = {
  powerPs: EMPTY_RANGE,
  topSpeedKph: EMPTY_RANGE,
  accel0to100s: EMPTY_RANGE,
  year: EMPTY_RANGE,
  powerToWeight: EMPTY_RANGE,
  classes: [],
  drivetrains: [],
  fuelTypes: [],
  onlyWithoutTime: false,
};

function inRange(value: number, range: Range): boolean {
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

/** `timedCarIds` carries the cars that already hold a time on the track in
 * play; it is only consulted when that filter is on. */
export function matchesFilter(car: CarData, filter: CarFilter, timedCarIds?: ReadonlySet<string>): boolean {
  if (!inRange(car.powerPs, filter.powerPs)) return false;
  if (!inRange(car.topSpeedKph, filter.topSpeedKph)) return false;
  if (!inRange(car.accel0to100s, filter.accel0to100s)) return false;
  if (!inRange(car.year, filter.year)) return false;
  if (!inRange(powerToWeight(car), filter.powerToWeight)) return false;
  if (filter.classes.length > 0 && !filter.classes.includes(carClassOf(car).id)) return false;
  if (filter.drivetrains.length > 0 && !filter.drivetrains.includes(car.drivetrain)) return false;
  if (filter.fuelTypes.length > 0 && !filter.fuelTypes.includes(car.fuelType)) return false;
  if (filter.onlyWithoutTime && timedCarIds?.has(car.id)) return false;
  return true;
}

export function isFilterActive(filter: CarFilter): boolean {
  return (
    filter.powerPs.min !== null ||
    filter.powerPs.max !== null ||
    filter.topSpeedKph.min !== null ||
    filter.topSpeedKph.max !== null ||
    filter.accel0to100s.min !== null ||
    filter.accel0to100s.max !== null ||
    filter.year.min !== null ||
    filter.year.max !== null ||
    filter.powerToWeight.min !== null ||
    filter.powerToWeight.max !== null ||
    filter.classes.length > 0 ||
    filter.drivetrains.length > 0 ||
    filter.fuelTypes.length > 0 ||
    filter.onlyWithoutTime
  );
}

/** Number of individual criteria in use, for the badge on the filter toggle. */
export function activeFilterCount(filter: CarFilter): number {
  let n = 0;
  for (const range of [
    filter.powerPs,
    filter.topSpeedKph,
    filter.accel0to100s,
    filter.year,
    filter.powerToWeight,
  ]) {
    if (range.min !== null || range.max !== null) n++;
  }
  if (filter.classes.length > 0) n++;
  if (filter.drivetrains.length > 0) n++;
  if (filter.fuelTypes.length > 0) n++;
  if (filter.onlyWithoutTime) n++;
  return n;
}
