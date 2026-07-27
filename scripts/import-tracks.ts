/** Downloads the real circuit centrelines and writes them out as local metre
 * coordinates for `src/data/track-outlines.ts`.
 *
 * The circuits were previously drawn by eye, which produced closed but generic
 * shapes - a lap that comes back to the line is not the same as a lap that
 * looks like Monaco. These are surveyed ways, so the outline on screen is the
 * circuit's real geometry and the corner radii the simulation uses are measured
 * off it.
 *
 * Three sources, all of them OpenStreetMap surveys underneath:
 *
 *  - bacinger/f1-circuits    every circuit Formula 1 has raced on, as GeoJSON
 *                            in lon/lat. ODbL.
 *  - tobi/track-atlas        the rest of the racing world - Le Mans prototypes,
 *                            IMSA, club circuits - as GeoJSON in lon/lat. MIT
 *                            for the repository, ODbL for the geometry.
 *  - TUMFTM/racetrack-database  DTM and IndyCar tracks as CSV, already in
 *                            metres and smoothed. LGPL-3.0.
 *
 * Run with: npm run import:tracks
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const F1_CIRCUITS = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits";
const TRACK_ATLAS = "https://raw.githubusercontent.com/tobi/track-atlas/main/tracks";
const TUMFTM = "https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks";

/** One circuit to fetch. `name` becomes the exported constant's name; the
 * display name lives in src/data/tracks.ts, so an umlaut here would only make
 * an identifier ugly. */
type CircuitSource =
  | { from: "f1"; id: string; name: string }
  | { from: "atlas"; slug: string; layout: string; name: string }
  | { from: "tum"; file: string; name: string };

const CIRCUITS: CircuitSource[] = [
  { from: "f1", id: "it-1922", name: "Monza" },
  { from: "f1", id: "be-1925", name: "Spa-Francorchamps" },
  { from: "f1", id: "mc-1929", name: "Monaco" },
  { from: "f1", id: "jp-1962", name: "Suzuka" },
  { from: "f1", id: "gb-1948", name: "Silverstone" },
  { from: "f1", id: "hu-1986", name: "Hungaroring" },
  { from: "f1", id: "br-1940", name: "Interlagos" },
  { from: "f1", id: "ca-1978", name: "Montreal" },
  { from: "f1", id: "at-1969", name: "Red Bull Ring" },
  { from: "f1", id: "nl-1948", name: "Zandvoort" },
  { from: "f1", id: "az-2016", name: "Baku" },
  { from: "f1", id: "us-2012", name: "Austin" },
  { from: "f1", id: "it-1953", name: "Imola" },
  { from: "f1", id: "sg-2008", name: "Singapur" },
  { from: "f1", id: "it-1914", name: "Mugello" },
  { from: "f1", id: "sa-2021", name: "Jeddah" },
  { from: "f1", id: "mx-1962", name: "Mexiko" },
  { from: "f1", id: "bh-2002", name: "Bahrain" },
  { from: "f1", id: "cn-2004", name: "Shanghai" },
  { from: "f1", id: "tr-2005", name: "Istanbul" },
  { from: "f1", id: "my-1999", name: "Sepang" },
  { from: "f1", id: "au-1953", name: "Melbourne" },
  { from: "f1", id: "pt-2008", name: "Portimao" },
  { from: "f1", id: "es-1991", name: "Barcelona" },
  { from: "f1", id: "de-1932", name: "Hockenheim" },
  { from: "f1", id: "de-1927", name: "Nuerburgring" },
  { from: "f1", id: "ae-2009", name: "Yas Marina" },
  { from: "f1", id: "fr-1969", name: "Paul Ricard" },
  { from: "f1", id: "us-2023", name: "Las Vegas" },
  { from: "f1", id: "us-1956", name: "Watkins Glen" },
  { from: "f1", id: "us-1909", name: "Indianapolis" },
  { from: "f1", id: "za-1961", name: "Kyalami" },
  { from: "f1", id: "pt-1972", name: "Estoril" },
  { from: "f1", id: "fr-1960", name: "Magny Cours" },
  { from: "f1", id: "qa-2004", name: "Losail" },
  { from: "f1", id: "us-2022", name: "Miami" },
  { from: "f1", id: "ru-2014", name: "Sochi" },
  { from: "f1", id: "es-2026", name: "Madrid" },
  { from: "f1", id: "ar-1952", name: "Buenos Aires" },
  { from: "f1", id: "br-1977", name: "Jacarepagua" },

  // Everything outside Formula 1's own calendar.
  { from: "atlas", slug: "lime-rock", layout: "gp", name: "Lime Rock" },
  { from: "atlas", slug: "long-beach", layout: "gp", name: "Long Beach" },
  { from: "atlas", slug: "laguna-seca", layout: "gp", name: "Laguna Seca" },
  { from: "atlas", slug: "mosport", layout: "gp", name: "Mosport" },
  { from: "atlas", slug: "road-atlanta", layout: "gp", name: "Road Atlanta" },
  { from: "atlas", slug: "fuji", layout: "gp", name: "Fuji" },
  { from: "atlas", slug: "virginia-international-raceway", layout: "gp", name: "Virginia" },
  { from: "atlas", slug: "daytona", layout: "gp", name: "Daytona" },
  { from: "atlas", slug: "sebring", layout: "imsa", name: "Sebring" },
  { from: "atlas", slug: "road-america", layout: "gp", name: "Road America" },

  // The DTM circuits and the Indianapolis oval, which only this source has.
  { from: "tum", file: "BrandsHatch", name: "Brands Hatch" },
  { from: "tum", file: "Norisring", name: "Norisring" },
  { from: "tum", file: "Oschersleben", name: "Oschersleben" },
  { from: "tum", file: "MoscowRaceway", name: "Moscow Raceway" },
  { from: "tum", file: "IMS", name: "Indianapolis Oval" },
];

/** Metres per degree at the equator; longitude shrinks with the cosine of the
 * latitude. Over a few kilometres this flat approximation is exact enough - the
 * error across Spa's 7 km is centimetres. */
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320;

interface GeoJson {
  features: {
    properties: { Name?: string; length?: number; role?: string };
    geometry: { type: string; coordinates: [number, number][] };
  }[];
}

/** Projects lon/lat around the shape's own centre, so x and y are metres east
 * and north of it and the numbers stay small and readable. */
function toMetres(lonLat: [number, number][]): [number, number][] {
  const lat0 = lonLat.reduce((s, p) => s + p[1], 0) / lonLat.length;
  const lon0 = lonLat.reduce((s, p) => s + p[0], 0) / lonLat.length;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  return lonLat.map(([lon, lat]) => [
    (lon - lon0) * M_PER_DEG_LON * cos,
    (lat - lat0) * M_PER_DEG_LAT,
  ]);
}

function recentre(points: [number, number][]): [number, number][] {
  const x0 = points.reduce((s, p) => s + p[0], 0) / points.length;
  const y0 = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [x - x0, y - y0]);
}

async function fetchText(url: string): Promise<string> {
  process.stdout.write(`Downloading ${url} ...\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

/** The centreline in metres, plus whatever the source says about itself. */
async function load(circuit: CircuitSource): Promise<{ points: [number, number][]; label: string; statedLengthM?: number }> {
  if (circuit.from === "f1") {
    const geo = JSON.parse(await fetchText(`${F1_CIRCUITS}/${circuit.id}.geojson`)) as GeoJson;
    const feature = geo.features[0];
    return {
      points: toMetres(feature.geometry.coordinates),
      label: feature.properties.Name ?? circuit.name,
      statedLengthM: feature.properties.length,
    };
  }

  if (circuit.from === "atlas") {
    const geo = JSON.parse(
      await fetchText(`${TRACK_ATLAS}/${circuit.slug}/raw/layers/${circuit.layout}.geojson`),
    ) as GeoJson;
    // The file also carries corners, pit markers and the start line as points;
    // the lap itself is the one line tagged as the outline.
    const outline = geo.features.find(
      (f) => f.geometry.type === "LineString" && f.properties.role === "outline",
    );
    if (!outline) throw new Error(`${circuit.slug}: no outline in the layer`);
    return { points: toMetres(outline.geometry.coordinates), label: circuit.name };
  }

  // Already metres, and already smoothed - the columns after x and y are the
  // track's width to each side, which the model has no use for.
  const rows = (await fetchText(`${TUMFTM}/${circuit.file}.csv`))
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"));
  return {
    points: recentre(rows.map((line) => line.split(",").slice(0, 2).map(Number) as [number, number])),
    label: circuit.name,
  };
}

/** Drops points closer together than `minStepM`, which the source has plenty of
 * on the tight sections and which only make the file bigger. */
function thin(points: [number, number][], minStepM: number): [number, number][] {
  const kept: [number, number][] = [points[0]];
  for (const point of points.slice(1, -1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= minStepM) kept.push(point);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

async function main() {
  const out: string[] = [];

  for (const circuit of CIRCUITS) {
    const { points, label, statedLengthM } = await load(circuit);
    let metres = points;

    // Some sources repeat the first point to close the ring; the outline is
    // closed by definition, so the duplicate would be a zero-length step.
    const first = metres[0];
    const last = metres[metres.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 3) metres = metres.slice(0, -1);

    metres = thin(metres, 8);

    let length = 0;
    for (let i = 0; i < metres.length; i++) {
      const a = metres[i];
      const b = metres[(i + 1) % metres.length];
      length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }

    console.log(
      `  ${label}: ${metres.length} Punkte, ${Math.round(length)} m gemessen` +
        (statedLengthM ? `, ${statedLengthM} m laut Quelle` : ""),
    );

    const coords = metres.map(([x, y]) => `[${x.toFixed(1)}, ${y.toFixed(1)}]`);
    const lines: string[] = [];
    for (let i = 0; i < coords.length; i += 6) lines.push("  " + coords.slice(i, i + 6).join(", ") + ",");

    out.push(
      `/** ${label}, ${Math.round(length)} m. Metres east and north of the circuit's centre. */\n` +
        `export const ${circuit.name.toUpperCase().replace(/[^A-Z]/g, "_")}_OUTLINE: [number, number][] = [\n${lines.join("\n")}\n];`,
    );
  }

  const header = `// Generated by scripts/import-tracks.ts - do not edit by hand.
//
// Surveyed circuit centrelines, projected to metres around each circuit's own
// centre. All three sources are OpenStreetMap surveys underneath, so the
// geometry is ODbL, (c) OpenStreetMap contributors:
//
//   https://github.com/bacinger/f1-circuits        (ODbL)
//   https://github.com/tobi/track-atlas            (MIT repository, ODbL geometry)
//   https://github.com/TUMFTM/racetrack-database   (LGPL-3.0)
`;
  const outPath = join(import.meta.dirname, "..", "src", "data", "track-outlines.ts");
  writeFileSync(outPath, `${header}\n${out.join("\n\n")}\n`);
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
