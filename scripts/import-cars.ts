/**
 * Imports real car data from the CarQuery API (https://www.carqueryapi.com/) and
 * keeps ONLY cars that have every field our physics engine and UI need. Anything
 * missing a required stat is dropped rather than filled in with a guess.
 *
 * This script must be run from a machine with normal internet access - this
 * sandbox's network policy blocks carqueryapi.com, so it can't be exercised here.
 *
 *   npx tsx scripts/import-cars.ts
 *
 * Writes the result to prisma/seed-data/cars.json, which `npm run db:seed` then
 * loads into the SQLite database.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const API_BASE = "https://www.carqueryapi.com/api/0.3/";

// Curated spread of makes so the resulting dataset covers a wide range of
// performance characteristics (economy cars through hypercars, plus at least
// one EV) - edit this list to add/remove manufacturers.
const MAKES = [
  "toyota",
  "honda",
  "volkswagen",
  "ford",
  "chevrolet",
  "bmw",
  "mercedes-benz",
  "audi",
  "porsche",
  "nissan",
  "dodge",
  "ferrari",
  "lamborghini",
  "mclaren",
  "bugatti",
  "koenigsegg",
  "tesla",
];

const REQUEST_DELAY_MS = 300; // be a courteous, unauthenticated free-API citizen

interface RawTrim {
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

interface ImportedCar {
  make: string;
  model: string;
  year: number;
  topSpeedKph: number;
  accel0to100s: number;
  powerPs: number;
  weightKg: number;
  torqueNm: number;
  drivetrain: "FWD" | "RWD" | "AWD";
  fuelType: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`CarQuery request failed: ${res.status} ${url}`);
  let text = await res.text();
  // CarQuery sometimes wraps the payload in a JSONP callback even without
  // requesting one; strip it defensively before parsing.
  const match = text.match(/^\s*[\w.$]+\(([\s\S]*)\);?\s*$/);
  if (match) text = match[1];
  return JSON.parse(text) as T;
}

function mapDrivetrain(raw: string | undefined): "FWD" | "RWD" | "AWD" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "fwd" || v === "front" || v === "front-wheel drive") return "FWD";
  if (v === "rwd" || v === "rear" || v === "rear-wheel drive") return "RWD";
  if (v === "all" || v === "4wd" || v === "awd" || v.includes("all wheel") || v.includes("4x4")) return "AWD";
  return null;
}

function toPositiveFloat(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function convertTrim(trim: RawTrim): ImportedCar | null {
  const make = trim.model_make_display?.trim();
  const model = trim.model_name?.trim();
  const year = trim.model_year ? parseInt(trim.model_year, 10) : NaN;
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

async function main() {
  const kept = new Map<string, ImportedCar>();
  let seen = 0;

  for (const make of MAKES) {
    console.log(`Fetching models for ${make}...`);
    const modelsRes = await fetchJson<{ Models: { model_name: string }[] }>({
      cmd: "getModels",
      make,
    });
    await sleep(REQUEST_DELAY_MS);

    for (const m of modelsRes.Models ?? []) {
      const trimsRes = await fetchJson<{ Trims: RawTrim[] }>({
        cmd: "getTrims",
        make,
        model: m.model_name,
        full_results: "1",
      });
      await sleep(REQUEST_DELAY_MS);

      for (const trim of trimsRes.Trims ?? []) {
        seen++;
        const car = convertTrim(trim);
        if (!car) continue;
        const key = `${car.make}|${car.model}|${car.year}`;
        const existing = kept.get(key);
        // Keep the highest-power trim as the representative for a given model+year.
        if (!existing || car.powerPs > existing.powerPs) kept.set(key, car);
      }
    }
  }

  const cars = Array.from(kept.values());
  const outPath = join(__dirname, "..", "src", "data", "cars.json");
  writeFileSync(outPath, JSON.stringify(cars, null, 2));

  console.log(`Considered ${seen} trims, kept ${cars.length} with complete data.`);
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
