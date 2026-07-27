import type { Drivetrain } from "@/lib/physics";
import { carSlug } from "@/lib/slug";

/** Parsing for the autoevolution-derived spec dump published at
 * https://github.com/ilyasozkurt/automobile-models-and-specs
 *
 * Its values are human-readable strings carrying several units at once, e.g.
 * "155 Mph (249 Km/H)" or "257.4 Kw @ 6500 Rpm / 350 Hp @ 6500 Rpm". The
 * functions below pull out the metric figure we need, and return null whenever
 * a value is missing or unparseable so the car can be dropped rather than
 * guessed at. */

export interface RawEngine {
  automobile_id?: string | number;
  name?: string;
  specs?: Record<string, Record<string, string>>;
}

export interface RawAutomobile {
  id?: string | number;
  brand_id?: string | number;
  name?: string;
}

export interface RawBrand {
  id?: string | number;
  name?: string;
}

export type BrakeKind = "ventilated-disc" | "disc" | "drum";

export interface ImportedCar {
  make: string;
  model: string;
  /** The engine variant, e.g. "3.5L V8 32V Turbo 6MT". Part of the identity,
   * since variants of one model year differ in how they drive. */
  variant: string;
  year: number;
  topSpeedKph: number;
  accel0to100s: number;
  powerPs: number;
  weightKg: number;
  torqueNm: number;
  drivetrain: Drivetrain;
  fuelType: string;
  /** Drag coefficient, plus the body dimensions the frontal area comes from. */
  dragCoefficient: number;
  widthMm: number;
  heightMm: number;
  brakeFront: BrakeKind;
  brakeRear: BrakeKind;
  /** Tread width in mm, e.g. 225 from "225/50 R17". */
  tyreWidthMm: number;
  gearCount: number;
  manualGearbox: boolean;
}

export const SPEC_FIELDS = {
  drag: ["Dimensions", "Aerodynamics (Cd):"],
  width: ["Dimensions", "Width:"],
  height: ["Dimensions", "Height:"],
  brakeFront: ["Brakes Specs", "Front:"],
  brakeRear: ["Brakes Specs", "Rear:"],
  tyres: ["Tires Specs", "Tire Size:"],
  gearbox: ["Transmission Specs", "Gearbox:"],
  power: ["Engine Specs", "Power:"],
  torque: ["Engine Specs", "Torque:"],
  fuel: ["Engine Specs", "Fuel:"],
  weight: ["Weight Specs", "Unladen Weight:"],
  accel: ["Performance Specs", "Acceleration 0-62 Mph (0-100 Kph):"],
  topSpeed: ["Performance Specs", "Top Speed:"],
  drive: ["Transmission Specs", "Drive Type:"],
} as const;

function spec(engine: RawEngine, [group, key]: readonly [string, string]): string | undefined {
  return engine.specs?.[group]?.[key];
}

/** Power is listed as kW, Hp and Bhp on separate lines. We want Hp, which on
 * autoevolution is metric horsepower (PS) - matching per line keeps "345 Bhp"
 * from being read as an Hp figure. */
export function parsePowerPs(raw: string | undefined): number | null {
  if (!raw) return null;
  for (const line of raw.split(/[\r\n]+/)) {
    const m = line.match(/^\s*(\d+(?:[.,]\d+)?)\s*hp\b/i);
    if (m) return toNumber(m[1]);
  }
  return null;
}

/** Torque is listed as Lb-Ft and Nm on separate lines. */
export function parseTorqueNm(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*nm\b/i);
  return m ? toNumber(m[1]) : null;
}

/** "3560 Lbs (1615 Kg)", occasionally metric-only. */
export function parseWeightKg(raw: string | undefined): number | null {
  return parseMetric(raw, /\(\s*(\d+(?:[.,]\d+)?)\s*kg\s*\)/i, /(\d+(?:[.,]\d+)?)\s*kg\b/i);
}

/** "155 Mph (249 Km/H)", occasionally metric-only. */
export function parseTopSpeedKph(raw: string | undefined): number | null {
  return parseMetric(raw, /\(\s*(\d+(?:[.,]\d+)?)\s*km\/h\s*\)/i, /(\d+(?:[.,]\d+)?)\s*km\/h\b/i);
}

/** "5.6 S" */
export function parseSeconds(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*s\b/i);
  return m ? toNumber(m[1]) : null;
}

export function parseDrivetrain(raw: string | undefined): Drivetrain | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "none") return null;
  if (v.startsWith("front")) return "FWD";
  if (v.startsWith("rear")) return "RWD";
  if (v.startsWith("all") || v.startsWith("four") || v.includes("4x4")) return "AWD";
  return null;
}

function parseMetric(raw: string | undefined, preferred: RegExp, fallback: RegExp): number | null {
  if (!raw) return null;
  const m = raw.match(preferred) ?? raw.match(fallback);
  return m ? toNumber(m[1]) : null;
}

function toNumber(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "0.31" - a bare number, but guard the range so a stray value cannot make a
 * car slippery beyond physics. */
export function parseDragCoefficient(raw: string | undefined): number | null {
  const n = toNumber((raw ?? "").trim());
  return n !== null && n >= 0.1 && n <= 1.2 ? n : null;
}

/** "74.4 In (1890 Mm)" */
export function parseMillimetres(raw: string | undefined): number | null {
  return parseMetric(raw, /\(\s*(\d+(?:[.,]\d+)?)\s*mm\s*\)/i, /(\d+(?:[.,]\d+)?)\s*mm\b/i);
}

/** The source spells brakes many ways ("Ventilated Discs", "Vented Disc",
 * "Single-Piston Floating-Calliper Vented Disc Brakes"), so match on what the
 * words say rather than on the exact string. */
export function parseBrake(raw: string | undefined): BrakeKind | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  const isDisc = /disc|disk/.test(v);
  if (isDisc && /vent/.test(v)) return "ventilated-disc";
  if (isDisc) return "disc";
  if (/drum/.test(v)) return "drum";
  return null;
}

/** "225/50 R17" or "205/55R16" - only the tread width matters here. */
export function parseTyreWidthMm(raw: string | undefined): number | null {
  const m = (raw ?? "").match(/(\d{3})\s*\//);
  if (!m) return null;
  const width = Number.parseInt(m[1], 10);
  return width >= 100 && width <= 400 ? width : null;
}

/** "6-Speed Manual" / "8-Speed Automatic" */
export function parseGearbox(raw: string | undefined): { gearCount: number; manual: boolean } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = v.match(/(\d{1,2})\s*-?\s*speed/i);
  if (!m) return null;
  const gearCount = Number.parseInt(m[1], 10);
  if (gearCount < 1 || gearCount > 12) return null;
  return { gearCount, manual: /manual/i.test(v) };
}

/** Names that plain titlecasing gets wrong. */
const MAKE_ALIASES: Record<string, string> = {
  MCLAREN: "McLaren",
  "MERCEDES BENZ": "Mercedes-Benz",
  SSANGYONG: "SsangYong",
};

/** Brand words that are acronyms or stylized capitals, not shouting. */
const MAKE_KEEP_UPPERCASE = new Set([
  "AC",
  "AMG",
  "BMW",
  "DR",
  "DS",
  "FSO",
  "GMC",
  "GTA",
  "KTM",
  "MG",
  "MINI",
  "RAM",
  "SEAT",
  "TVR",
]);

/** The source mixes shouted names ("MERCEDES BENZ") with already-correct ones
 * ("DeLorean", "Mercedes-AMG", "Polestar"), so only all-caps names get
 * titlecased - anything already carrying lowercase letters is left alone. */
export function normalizeMake(raw: string | undefined): string | null {
  const name = raw?.trim().replace(/\s+/g, " ");
  if (!name) return null;

  const alias = MAKE_ALIASES[name.toUpperCase()];
  if (alias) return alias;

  if (name !== name.toUpperCase()) return name; // already mixed case

  return name
    .split(" ")
    .map((word) =>
      word
        .split("-") // "ROLLS-ROYCE" is two words to titlecase, not one
        .map((part) => (MAKE_KEEP_UPPERCASE.has(part) ? part : part[0] + part.slice(1).toLowerCase()))
        .join("-"),
    )
    .join(" ");
}

/** Model entries look like "VOLKSWAGEN Golf VII 5 Doors 2012-2017 Photos,
 * engines &amp; full specs" - occasionally with the year leading instead
 * ("2015 Lotus Evora 400") and sometimes with no year at all. */
export function parseModelAndYear(
  rawName: string | undefined,
  make: string,
): { model: string; year: number } | null {
  if (!rawName) return null;

  let text = rawName
    .replace(/&amp;?/gi, "&")
    .replace(/\bPhotos,?\s*engines\s*&?\s*full specs\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Drop the brand wherever it appears, so "2015 Lotus Evora 400" also works.
  // Hyphens and spaces are interchangeable here: the normalized make may read
  // "Mercedes-Benz" while the model name spells it "MERCEDES BENZ", and without
  // this the brand would survive into the model ("Mercedes-Benz MERCEDES BENZ 300 SL").
  const makeWords = make.split(/[\s-]+/).map(escapeRegExp).join("[\\s-]+");
  text = text.replace(new RegExp(`\\b${makeWords}\\b`, "i"), " ").replace(/\s+/g, " ").trim();

  // Model years are 4-digit, optionally a range ("2012-2017" / "2012 - present").
  const yearMatch = text.match(/\b(1[89]\d{2}|20\d{2})\b(\s*[-–]\s*(1[89]\d{2}|20\d{2}|present))?/i);
  if (!yearMatch) return null;
  const year = Number.parseInt(yearMatch[1], 10);

  const model = text.replace(yearMatch[0], " ").replace(/\s+/g, " ").replace(/^[-–,\s]+|[-–,\s]+$/g, "");
  if (!model) return null;

  return { model, year };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Engine names read like "3.5L V8 32V Turbo 6MT (354 HP)". The trailing power
 * is dropped because the card already shows it as a real number. */
export function cleanVariant(rawName: string | undefined): string | null {
  const cleaned = rawName
    ?.replace(/\(\s*[\d.]+\s*(hp|bhp|ps|kw)\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned : null;
}

/** Builds a car from one engine variant, or returns null if ANY required value
 * is missing. Dropping the car is deliberate: every car in the game must carry
 * the same real, measured stats rather than estimated stand-ins. */
export function convertEngine(
  engine: RawEngine,
  automobile: RawAutomobile | undefined,
  brand: RawBrand | undefined,
): ImportedCar | null {
  const make = normalizeMake(brand?.name);
  if (!make) return null;

  const modelYear = parseModelAndYear(automobile?.name, make);
  if (!modelYear) return null;

  const variant = cleanVariant(engine.name);
  if (!variant) return null;

  const powerPs = parsePowerPs(spec(engine, SPEC_FIELDS.power));
  const torqueNm = parseTorqueNm(spec(engine, SPEC_FIELDS.torque));
  const weightKg = parseWeightKg(spec(engine, SPEC_FIELDS.weight));
  const accel0to100s = parseSeconds(spec(engine, SPEC_FIELDS.accel));
  const topSpeedKph = parseTopSpeedKph(spec(engine, SPEC_FIELDS.topSpeed));
  const drivetrain = parseDrivetrain(spec(engine, SPEC_FIELDS.drive));
  const dragCoefficient = parseDragCoefficient(spec(engine, SPEC_FIELDS.drag));
  const widthMm = parseMillimetres(spec(engine, SPEC_FIELDS.width));
  const heightMm = parseMillimetres(spec(engine, SPEC_FIELDS.height));
  const brakeFront = parseBrake(spec(engine, SPEC_FIELDS.brakeFront));
  const brakeRear = parseBrake(spec(engine, SPEC_FIELDS.brakeRear));
  const tyreWidthMm = parseTyreWidthMm(spec(engine, SPEC_FIELDS.tyres));
  const gearbox = parseGearbox(spec(engine, SPEC_FIELDS.gearbox));
  // Fuel is free text, so require actual letters rather than a "-" placeholder.
  const rawFuel = spec(engine, SPEC_FIELDS.fuel)?.trim();
  const fuelType = rawFuel && /[a-z]/i.test(rawFuel) ? rawFuel : undefined;

  if (
    powerPs === null ||
    torqueNm === null ||
    weightKg === null ||
    accel0to100s === null ||
    topSpeedKph === null ||
    !drivetrain ||
    !fuelType ||
    dragCoefficient === null ||
    widthMm === null ||
    heightMm === null ||
    !brakeFront ||
    !brakeRear ||
    tyreWidthMm === null ||
    !gearbox
  ) {
    return null;
  }

  return {
    make,
    model: modelYear.model,
    variant,
    year: modelYear.year,
    topSpeedKph,
    accel0to100s,
    powerPs,
    weightKg,
    torqueNm,
    drivetrain,
    fuelType,
    dragCoefficient,
    widthMm,
    heightMm,
    brakeFront,
    brakeRear,
    tyreWidthMm,
    gearCount: gearbox.gearCount,
    manualGearbox: gearbox.manual,
  };
}

/** The values that decide how a car actually drives. Two variants sharing all
 * of these would be the same car in the game, whatever the badge says. */
export function performanceSignature(car: ImportedCar): string {
  return [
    car.topSpeedKph,
    car.accel0to100s,
    car.powerPs,
    car.weightKg,
    car.torqueNm,
    car.drivetrain,
    car.fuelType,
    car.dragCoefficient,
    car.brakeFront,
    car.brakeRear,
    car.tyreWidthMm,
    car.gearCount,
    car.manualGearbox,
  ].join("|");
}

/** Keeps every variant that races differently, and collapses the ones that do
 * not - a model year listed with three gearboxes but identical figures adds
 * three identical cars to choose between, which is only noise.
 *
 * Ids are checked for collisions as a last step: names differing only in
 * punctuation ("Ibiza 5 doors" vs "Ibiza 5-doors") slug to the same string, and
 * two cars sharing an id would mean duplicate React keys and one silently
 * overwriting the other when seeded. */
export function dedupeVariants(cars: ImportedCar[]): ImportedCar[] {
  const distinct = new Map<string, ImportedCar>();
  for (const car of cars) {
    const key = `${car.make}|${car.model}|${car.year}|${performanceSignature(car)}`;
    const existing = distinct.get(key);
    // Prefer the shorter variant label; they describe the same car anyway.
    if (!existing || car.variant.length < existing.variant.length) distinct.set(key, car);
  }

  const used = new Set<string>();
  const result: ImportedCar[] = [];
  for (const car of distinct.values()) {
    let candidate = car;
    let slug = carSlug(candidate);
    for (let n = 2; used.has(slug); n++) {
      candidate = { ...car, variant: `${car.variant} (${n})` };
      slug = carSlug(candidate);
    }
    used.add(slug);
    result.push(candidate);
  }
  return result;
}

/** Thins a model year down to its two ends: the entry-level engine and the most
 * powerful one.
 *
 * The source lists every engine a model was ever sold with - 46 versions of the
 * 2009 Volvo S80, 167 BMW 5 Series across the years. They are not duplicates,
 * they genuinely differ, but a picker full of adjacent diesel variants is no
 * use and the interesting span is between the weakest and the strongest.
 *
 * Grouping is by make, model AND year on purpose: collapsing across years would
 * put a 1995 5 Series and a 2020 one in one group and delete every generation
 * in between, while the year is shown everywhere in the app. */
export function keepBaseAndTopVariants(cars: ImportedCar[]): ImportedCar[] {
  const groups = new Map<string, ImportedCar[]>();
  for (const car of cars) {
    const key = `${car.make}|${car.model}|${car.year}`;
    const group = groups.get(key);
    if (group) group.push(car);
    else groups.set(key, [car]);
  }

  const kept: ImportedCar[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    // Weakest first. Equal power is broken by the slower 0-100, then by the
    // variant name so the choice does not depend on the input order.
    const sorted = [...group].sort(
      (a, b) =>
        a.powerPs - b.powerPs ||
        b.accel0to100s - a.accel0to100s ||
        a.variant.localeCompare(b.variant),
    );
    const base = sorted[0];
    const top = sorted[sorted.length - 1];
    kept.push(base);
    // Equal power at both ends means the group has no span to show, so the
    // base already is the strongest version and one car covers it.
    if (top.powerPs > base.powerPs) kept.push(top);
  }
  return kept;
}

/** Guards against obviously broken source rows (a 5000 kg "sports car", a
 * 0.1 s 0-100). These are data errors, not interesting outliers. */
export function isPlausible(car: ImportedCar): boolean {
  return (
    car.topSpeedKph >= 40 &&
    car.topSpeedKph <= 500 &&
    car.accel0to100s >= 1 &&
    car.accel0to100s <= 60 &&
    car.powerPs >= 10 &&
    car.powerPs <= 2000 &&
    car.weightKg >= 300 &&
    car.weightKg <= 4000 &&
    car.torqueNm >= 20 &&
    car.torqueNm <= 2500 &&
    // Body dimensions decide the frontal area and with it the top speed, so a
    // misparsed one is not a harmless oddity: the source holds a Ford Focus
    // 71 mm wide and 58 mm tall, which would fly to 720 km/h.
    car.widthMm >= 1200 &&
    car.widthMm <= 2600 &&
    car.heightMm >= 900 &&
    car.heightMm <= 2600 &&
    car.tyreWidthMm >= 100 &&
    car.tyreWidthMm <= 400 &&
    car.gearCount >= 1 &&
    car.gearCount <= 10 &&
    car.dragCoefficient >= 0.15 &&
    car.dragCoefficient <= 0.8 &&
    car.year >= 1900 &&
    car.year <= 2030
  );
}
