/** Downloads the real circuit centrelines and writes them out as local metre
 * coordinates for `src/data/track-outlines.ts`.
 *
 * The circuits were previously drawn by eye, which produced closed but generic
 * shapes - a lap that comes back to the line is not the same as a lap that
 * looks like Monaco. These are the surveyed ways from OpenStreetMap, published
 * as GeoJSON at https://github.com/bacinger/f1-circuits, so the outline on
 * screen is the circuit's real geometry and the corner radii the simulation
 * uses are measured off it.
 *
 * Run with: npm run import:tracks
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits";

const CIRCUITS = [
  { id: "it-1922", name: "Monza" },
  { id: "be-1925", name: "Spa-Francorchamps" },
  { id: "mc-1929", name: "Monaco" },
  { id: "jp-1962", name: "Suzuka" },
  { id: "gb-1948", name: "Silverstone" },
  { id: "hu-1986", name: "Hungaroring" },
  { id: "br-1940", name: "Interlagos" },
  { id: "ca-1978", name: "Montreal" },
  { id: "at-1969", name: "Red Bull Ring" },
  { id: "nl-1948", name: "Zandvoort" },
  { id: "az-2016", name: "Baku" },
  { id: "us-2012", name: "Austin" },
  { id: "it-1953", name: "Imola" },
  { id: "sg-2008", name: "Singapur" },
  { id: "it-1914", name: "Mugello" },
  { id: "sa-2021", name: "Jeddah" },
  { id: "mx-1962", name: "Mexiko" },
  { id: "bh-2002", name: "Bahrain" },
  { id: "cn-2004", name: "Shanghai" },
  { id: "tr-2005", name: "Istanbul" },
  { id: "my-1999", name: "Sepang" },
  { id: "au-1953", name: "Melbourne" },
  { id: "pt-2008", name: "Portimao" },
  { id: "es-1991", name: "Barcelona" },
  { id: "de-1932", name: "Hockenheim" },
  { id: "de-1927", name: "Nuerburgring" },
  { id: "ae-2009", name: "Yas Marina" },
  { id: "fr-1969", name: "Paul Ricard" },
  { id: "us-2023", name: "Las Vegas" },
  { id: "us-1956", name: "Watkins Glen" },
  { id: "us-1909", name: "Indianapolis" },
  { id: "za-1961", name: "Kyalami" },
  { id: "pt-1972", name: "Estoril" },
  { id: "fr-1960", name: "Magny Cours" },
  { id: "qa-2004", name: "Losail" },
  { id: "us-2022", name: "Miami" },
  { id: "ru-2014", name: "Sochi" },
  { id: "es-2026", name: "Madrid" },
  { id: "ar-1952", name: "Buenos Aires" },
  { id: "br-1977", name: "Jacarepagua" },
] as const;

/** Metres per degree at the equator; longitude shrinks with the cosine of the
 * latitude. Over a few kilometres this flat approximation is exact enough - the
 * error across Spa's 7 km is centimetres. */
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320;

interface GeoJson {
  features: {
    properties: { Name?: string; length?: number };
    geometry: { type: string; coordinates: [number, number][] };
  }[];
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
    const url = `${SOURCE}/${circuit.id}.geojson`;
    process.stdout.write(`Downloading ${url} ...\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const geo = (await res.json()) as GeoJson;
    const feature = geo.features[0];
    const lonLat = feature.geometry.coordinates;

    // Project around the circuit's own centre, so x and y are metres east and
    // north of it and the numbers stay small and readable.
    const lat0 = lonLat.reduce((s, p) => s + p[1], 0) / lonLat.length;
    const lon0 = lonLat.reduce((s, p) => s + p[0], 0) / lonLat.length;
    const cos = Math.cos((lat0 * Math.PI) / 180);
    let metres: [number, number][] = lonLat.map(([lon, lat]) => [
      (lon - lon0) * M_PER_DEG_LON * cos,
      (lat - lat0) * M_PER_DEG_LAT,
    ]);

    // The source repeats the first point to close the ring; the outline is
    // closed by definition, so the duplicate would be a zero-length step.
    const first = metres[0];
    const last = metres[metres.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 5) metres = metres.slice(0, -1);

    metres = thin(metres, 8);

    let length = 0;
    for (let i = 0; i < metres.length; i++) {
      const a = metres[i];
      const b = metres[(i + 1) % metres.length];
      length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }

    console.log(
      `  ${feature.properties.Name}: ${metres.length} Punkte, ${Math.round(length)} m gemessen, ${feature.properties.length} m laut Quelle`,
    );

    const coords = metres.map(([x, y]) => `[${x.toFixed(1)}, ${y.toFixed(1)}]`);
    const lines: string[] = [];
    for (let i = 0; i < coords.length; i += 6) lines.push("  " + coords.slice(i, i + 6).join(", ") + ",");

    out.push(
      `/** ${feature.properties.Name}, ${Math.round(length)} m. Metres east and north of the circuit's centre. */\n` +
        `export const ${circuit.name.toUpperCase().replace(/[^A-Z]/g, "_")}_OUTLINE: [number, number][] = [\n${lines.join("\n")}\n];`,
    );
  }

  const header = `// Generated by scripts/import-tracks.ts - do not edit by hand.
//
// Surveyed circuit centrelines from OpenStreetMap, published as GeoJSON at
// https://github.com/bacinger/f1-circuits (ODbL, like OpenStreetMap itself).
// Projected to metres around each circuit's own centre.
`;
  const outPath = join(import.meta.dirname, "..", "src", "data", "track-outlines.ts");
  writeFileSync(outPath, `${header}\n${out.join("\n\n")}\n`);
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
