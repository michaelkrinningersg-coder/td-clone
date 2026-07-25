import type { Drivetrain } from "@/lib/physics";

/** Shape of a single trim as returned by the CarQuery API (`cmd=getTrims`).
 * Every field is optional because the API omits or blanks out values it does
 * not have for a given model. */
export interface RawTrim {
  model_make_display?: string;
  model_name?: string;
  model_year?: string;
  model_top_speed_kph?: string;
  model_0_to_100_kph?: string;
  model_engine_power_ps?: string;
  model_weight_kg?: string;
  model_engine_torque_nm?: string;
  model_drive?: string;
  model_engine_fuel?: string;
}

export interface ImportedCar {
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

export function mapDrivetrain(raw: string | undefined): Drivetrain | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.includes("all") || v.includes("4wd") || v.includes("awd") || v.includes("4x4")) return "AWD";
  if (v.includes("front")) return "FWD";
  if (v.includes("rear")) return "RWD";
  if (v === "fwd") return "FWD";
  if (v === "rwd") return "RWD";
  return null;
}

/** CarQuery returns numbers as strings and uses "", "-" or "n/a" for unknowns. */
export function toPositiveFloat(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Converts one API trim into a car, or returns null if ANY required value is
 * missing. Dropping the car is deliberate: the whole point is that every car in
 * the game has the same real, measured stats rather than estimated stand-ins. */
export function convertTrim(trim: RawTrim): ImportedCar | null {
  const make = trim.model_make_display?.trim();
  const model = trim.model_name?.trim();
  const year = trim.model_year ? Number.parseInt(trim.model_year, 10) : Number.NaN;
  const topSpeedKph = toPositiveFloat(trim.model_top_speed_kph);
  const accel0to100s = toPositiveFloat(trim.model_0_to_100_kph);
  const powerPs = toPositiveFloat(trim.model_engine_power_ps);
  const weightKg = toPositiveFloat(trim.model_weight_kg);
  const torqueNm = toPositiveFloat(trim.model_engine_torque_nm);
  const drivetrain = mapDrivetrain(trim.model_drive);
  const fuelType = trim.model_engine_fuel?.trim();

  if (
    !make ||
    !model ||
    !Number.isFinite(year) ||
    topSpeedKph === null ||
    accel0to100s === null ||
    powerPs === null ||
    weightKg === null ||
    torqueNm === null ||
    !drivetrain ||
    !fuelType
  ) {
    return null;
  }

  return { make, model, year, topSpeedKph, accel0to100s, powerPs, weightKg, torqueNm, drivetrain, fuelType };
}

/** CarQuery sometimes wraps its payload in a JSONP callback even when none was
 * requested, which would otherwise make JSON.parse throw. The callback name can
 * be a bare "?" - that is the placeholder CarQuery's own docs use. */
export function stripJsonpWrapper(text: string): string {
  const match = text.match(/^\s*[\w.$?]+\(([\s\S]*)\);?\s*$/);
  return match ? match[1] : text;
}

/** Keeps the highest-power trim per make+model+year, so one model does not
 * flood the game with a dozen near-identical entries. */
export function pickRepresentativeTrims(cars: ImportedCar[]): ImportedCar[] {
  const best = new Map<string, ImportedCar>();
  for (const car of cars) {
    const key = `${car.make}|${car.model}|${car.year}`;
    const existing = best.get(key);
    if (!existing || car.powerPs > existing.powerPs) best.set(key, car);
  }
  return Array.from(best.values());
}
