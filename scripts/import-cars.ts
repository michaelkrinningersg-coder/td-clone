/**
 * Imports car specs from the autoevolution-derived dump published at
 * https://github.com/ilyasozkurt/automobile-models-and-specs and keeps ONLY
 * cars that have every field the physics engine and UI need. Anything missing
 * a required stat is dropped rather than filled in with a guess.
 *
 *   npm run import:cars
 *
 * Writes src/data/cars.json, which the app reads directly and `npm run db:seed`
 * loads into SQLite. The parsing lives in src/lib/car-import.ts and is covered
 * by src/lib/car-import.test.ts; this file is just download and assembly.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import {
  convertEngine,
  isPlausible,
  pickRepresentativeVariants,
  type ImportedCar,
  type RawAutomobile,
  type RawBrand,
  type RawEngine,
} from "../src/lib/car-import";

const SOURCE_URL =
  "https://raw.githubusercontent.com/ilyasozkurt/automobile-models-and-specs/master/automobiles.json.zip";

/** Optional cap on how many cars end up in the game, highest-power first.
 * Unset by default: the game ships the whole deduplicated field, and the car
 * picker filters it client-side. Set MAX_CARS to trim the payload. */
const MAX_CARS = process.env.MAX_CARS ? Number(process.env.MAX_CARS) : Infinity;

async function main() {
  console.log(`Downloading ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));

  const read = <T>(name: string): T[] => {
    const file = zip[name];
    if (!file) throw new Error(`${name} missing from archive`);
    return JSON.parse(strFromU8(file)) as T[];
  };

  const engines = read<RawEngine>("engines.json");
  const automobiles = read<RawAutomobile>("automobiles.json");
  const brands = read<RawBrand>("brands.json");
  console.log(`Read ${engines.length} engine variants, ${automobiles.length} models, ${brands.length} brands.`);

  const automobileById = new Map(automobiles.map((a) => [String(a.id), a]));
  const brandById = new Map(brands.map((b) => [String(b.id), b]));

  const complete: ImportedCar[] = [];
  let implausible = 0;
  for (const engine of engines) {
    const automobile = automobileById.get(String(engine.automobile_id));
    const brand = brandById.get(String(automobile?.brand_id));
    const car = convertEngine(engine, automobile, brand);
    if (!car) continue;
    if (!isPlausible(car)) {
      implausible++;
      continue;
    }
    complete.push(car);
  }

  const representative = pickRepresentativeVariants(complete);
  const selected = [...representative].sort((a, b) => b.powerPs - a.powerPs).slice(0, MAX_CARS);
  const cars = selected.sort(
    (a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.year - b.year,
  );

  const outPath = join(__dirname, "..", "src", "data", "cars.json");
  writeFileSync(outPath, `${JSON.stringify(cars, null, 2)}\n`);

  console.log(
    [
      `${engines.length} variants considered`,
      `${complete.length} had complete, plausible data (${implausible} dropped as implausible)`,
      `${representative.length} after one variant per model/year`,
      `${cars.length} written${Number.isFinite(MAX_CARS) ? ` (MAX_CARS=${MAX_CARS})` : ""}`,
    ].join("\n  -> "),
  );
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
