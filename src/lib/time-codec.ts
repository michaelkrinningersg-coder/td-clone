import type { TimeEntryData } from "@/lib/time-store";

/** How lap times are packed into the browser's storage.
 *
 * The browser gives an origin about five megabytes, and the whole field on
 * every track is 5.451 x 70 = 381.570 times. Written as JSON objects that is
 * 29 MB and the quota goes after a few championships; written like this it is
 * about three, and everything fits.
 *
 * Two ideas do the work. The car and track ids are the bulk of a time - a slug
 * like "porsche-cayenne-turbo-s-955-2006-4-5l-v8-6at" is fifty characters
 * repeated for every track that car has been round - so each distinct id is
 * written once into a dictionary and referred to by number. And the numbers
 * themselves go into a byte array rather than JSON: six bytes for a time
 * instead of seventy-six characters.
 *
 * The dictionary is what makes this survive a reimport. Storing a car's
 * position in the field would be smaller still, but the field is rebuilt
 * whenever the source data or the plausibility rules change - it has moved
 * four times already - and every stored time would then point at the wrong
 * car. Ids do not move.
 *
 *     {"v":3,"c":[carIds],"t":[trackIds],"at":seconds,"d":"<base64>"}
 *
 * with six bytes per time: car index (2), track index (1), milliseconds (3). */
export const TIMES_FORMAT_VERSION = 3;

const BYTES_PER_ENTRY = 6;
/** Three bytes hold 4,6 hours, which is longer than any run the game can
 * produce - the slowest thing in it is a two-minute timeout. */
const MAX_TIME_MS = 0xffffff;
/** Two bytes for the car, one for the track. The field is 5.451 cars and 70
 * tracks, so there is room for both to grow by an order of magnitude. */
const MAX_CARS = 0xffff;
const MAX_TRACKS = 0xff;

interface Payload {
  v: number;
  c: string[];
  t: string[];
  at: number;
  d: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: spreading a megabyte-long array into apply() blows the stack.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Packs every time into the one string the browser stores.
 *
 * `atSeconds` stands in for the per-entry timestamp, which nothing in the game
 * reads - no board sorts or shows it - so keeping one per write rather than
 * one per time saves four bytes each for nothing lost. */
export function encodeTimes(entries: readonly TimeEntryData[], atSeconds: number): string {
  const carIndex = new Map<string, number>();
  const trackIndex = new Map<string, number>();
  const bytes = new Uint8Array(entries.length * BYTES_PER_ENTRY);

  let offset = 0;
  for (const entry of entries) {
    let car = carIndex.get(entry.carId);
    if (car === undefined) {
      car = carIndex.size;
      carIndex.set(entry.carId, car);
    }
    let track = trackIndex.get(entry.trackId);
    if (track === undefined) {
      track = trackIndex.size;
      trackIndex.set(entry.trackId, track);
    }
    if (car > MAX_CARS || track > MAX_TRACKS) {
      throw new RangeError(`Zu viele ${car > MAX_CARS ? "Autos" : "Strecken"} für dieses Format`);
    }
    const ms = Math.max(0, Math.min(MAX_TIME_MS, Math.round(entry.timeMs)));

    bytes[offset++] = car & 0xff;
    bytes[offset++] = (car >> 8) & 0xff;
    bytes[offset++] = track;
    bytes[offset++] = ms & 0xff;
    bytes[offset++] = (ms >> 8) & 0xff;
    bytes[offset++] = (ms >> 16) & 0xff;
  }

  const payload: Payload = {
    v: TIMES_FORMAT_VERSION,
    c: [...carIndex.keys()],
    t: [...trackIndex.keys()],
    at: atSeconds,
    d: toBase64(bytes),
  };
  return JSON.stringify(payload);
}

/** Unpacks what `encodeTimes` wrote, and also reads the two shapes that came
 * before it so an update never costs a player their history:
 *  - v1, an array of full objects
 *  - v2, an array of `[carId, trackId, timeMs, seconds]` tuples
 *
 * Anything it cannot make sense of comes back empty rather than throwing - a
 * corrupt store should cost the boards, not the whole page. */
export function decodeTimes(raw: string): TimeEntryData[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return decodeLegacy(parsed);
    const payload = parsed as Payload;
    if (payload?.v !== TIMES_FORMAT_VERSION || typeof payload.d !== "string") return [];

    const bytes = fromBase64(payload.d);
    const createdAt = new Date(payload.at * 1000).toISOString();
    const entries: TimeEntryData[] = [];
    for (let offset = 0; offset + BYTES_PER_ENTRY <= bytes.length; offset += BYTES_PER_ENTRY) {
      const carId = payload.c[bytes[offset] | (bytes[offset + 1] << 8)];
      const trackId = payload.t[bytes[offset + 2]];
      if (carId === undefined || trackId === undefined) continue;
      const timeMs = bytes[offset + 3] | (bytes[offset + 4] << 8) | (bytes[offset + 5] << 16);
      entries.push({ id: `${trackId}:${carId}`, carId, trackId, timeMs, createdAt });
    }
    return entries;
  } catch {
    return [];
  }
}

function decodeLegacy(parsed: unknown[]): TimeEntryData[] {
  if (parsed.length === 0) return [];
  if (Array.isArray(parsed[0])) {
    return (parsed as [string, string, number, number][]).map(([carId, trackId, timeMs, seconds]) => ({
      id: `${trackId}:${carId}`,
      carId,
      trackId,
      timeMs,
      createdAt: new Date(seconds * 1000).toISOString(),
    }));
  }
  return parsed as TimeEntryData[];
}

/** Bytes one time costs once packed - the figure the storage budget is made
 * of, exported so a test can hold it to what this comment claims. */
export const BYTES_PER_TIME = BYTES_PER_ENTRY;
