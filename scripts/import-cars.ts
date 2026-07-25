/**
 * Imports real car data from the CarQuery API (https://www.carqueryapi.com/) and
 * keeps ONLY cars that have every field our physics engine and UI need. Anything
 * missing a required stat is dropped rather than filled in with a guess.
 *
 *   npm run import:cars
 *
 * Writes the result to src/data/cars.json, which the app reads directly and
 * `npm run db:seed` loads into SQLite.
 *
 * The filtering logic lives in src/lib/car-import.ts and is covered by
 * src/lib/car-import.test.ts; this file is just the network plumbing.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  convertTrim,
  pickRepresentativeTrims,
  stripJsonpWrapper,
  type ImportedCar,
  type RawTrim,
} from "../src/lib/car-import";

const API_BASE = "https://www.carqueryapi.com/api/0.3/";

// Curated spread of makes so the resulting dataset covers a wide range of
// performance characteristics (economy cars through hypercars, plus EVs) -
// edit this list to add or remove manufacturers.
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`CarQuery request failed: ${res.status} ${url}`);
  return JSON.parse(stripJsonpWrapper(await res.text())) as T;
}

async function main() {
  const kept: ImportedCar[] = [];
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
        if (car) kept.push(car);
      }
    }
  }

  const cars = pickRepresentativeTrims(kept).sort(
    (a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.year - b.year,
  );

  const outPath = join(__dirname, "..", "src", "data", "cars.json");
  writeFileSync(outPath, `${JSON.stringify(cars, null, 2)}\n`);

  console.log(
    `Considered ${seen} trims, ${kept.length} had complete data, kept ${cars.length} after picking one trim per model/year.`,
  );
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
