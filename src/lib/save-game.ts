import type { TimeEntryData } from "@/lib/time-store";

/** The whole game as one file: every time driven, plus whatever was left
 * running.
 *
 * Deliberately plain JSON with one array per thing, not the packed format the
 * browser stores. A save is an interchange file - it should survive being
 * opened, read, edited by hand and imported into a build that stores things
 * differently. The packing exists to fit five megabytes of browser quota, which
 * is not a problem a file on disk has.
 *
 * Times are tuples all the same, because they are the bulk of it: a thousand
 * times is 76 KB written this way and four times that as objects. */
export const SAVE_FORMAT = "td-clone-save";
export const SAVE_VERSION = 1;

/** `[carId, trackId, timeMs]` */
export type SavedTime = [string, string, number];

export interface SaveGame {
  format: typeof SAVE_FORMAT;
  version: number;
  exportedAt: string;
  /** What the field looked like when this was written. Not enforced on import -
   * a time whose car has since been dropped is simply reported and skipped -
   * but it is what lets the import say why something did not come through. */
  field: { cars: number; tracks: number };
  times: SavedTime[];
  /** Whatever was mid-flight, kept verbatim. The shapes belong to the hooks
   * that own them, and this file has no business knowing them. */
  championship?: unknown;
  duel?: unknown;
  session?: unknown;
}

export interface SaveContents {
  times: readonly TimeEntryData[];
  field: { cars: number; tracks: number };
  championship?: unknown;
  duel?: unknown;
  session?: unknown;
}

export function buildSave(contents: SaveContents, exportedAt: Date): SaveGame {
  const save: SaveGame = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    exportedAt: exportedAt.toISOString(),
    field: contents.field,
    times: contents.times.map((t) => [t.carId, t.trackId, Math.round(t.timeMs)]),
  };
  // Only carried when there is something to carry, so a save file does not
  // claim a championship is running when none is.
  if (contents.championship != null) save.championship = contents.championship;
  if (contents.duel != null) save.duel = contents.duel;
  if (contents.session != null) save.session = contents.session;
  return save;
}

/** A filename that sorts by date and says what it is. */
export function saveFileName(at: Date): string {
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `top-drives-spielstand-${stamp}.json`;
}

export type ReadResult = { ok: true; save: SaveGame } | { ok: false; error: string };

/** Reads a file the user picked, and says plainly what is wrong when it is not
 * a save - being handed the wrong file is the ordinary case, not an edge one. */
export function readSave(text: string): ReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Das ist keine JSON-Datei." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Die Datei enthält keinen Spielstand." };
  }
  const save = parsed as Partial<SaveGame>;
  if (save.format !== SAVE_FORMAT) {
    return { ok: false, error: "Die Datei ist kein Spielstand dieses Spiels." };
  }
  if (typeof save.version !== "number" || save.version > SAVE_VERSION) {
    return {
      ok: false,
      error: `Der Spielstand stammt aus einer neueren Version (${String(save.version)}).`,
    };
  }
  if (!Array.isArray(save.times)) {
    return { ok: false, error: "Dem Spielstand fehlen die Zeiten." };
  }
  const times = save.times.filter(
    (t): t is SavedTime =>
      Array.isArray(t) &&
      typeof t[0] === "string" &&
      typeof t[1] === "string" &&
      Number.isFinite(t[2]) &&
      (t[2] as number) > 0,
  );
  return {
    ok: true,
    save: {
      format: SAVE_FORMAT,
      version: save.version,
      exportedAt: typeof save.exportedAt === "string" ? save.exportedAt : "",
      field: save.field ?? { cars: 0, tracks: 0 },
      times,
      championship: save.championship,
      duel: save.duel,
      session: save.session,
    },
  };
}

export interface MergeReport {
  /** What should end up in the store. */
  entries: SavedTime[];
  /** Times for cars or tracks this build no longer has. */
  unknown: number;
  /** Cars that had no time on that track before. */
  added: number;
  /** Cars whose stored time the file beats. */
  improved: number;
  /** Cars whose stored time is the same or better, so nothing moved. */
  kept: number;
}

/** Folds an imported file into what is already there, keeping whichever time is
 * quicker - the same rule a repeated run follows, so importing your own save
 * back can never make a board worse.
 *
 * `knows` decides whether a car or track still exists. A save written before a
 * reimport can refer to cars that have since been dropped for implausible data;
 * those are counted and left out rather than smuggled into a board where
 * nothing can be looked up about them. */
export function mergeTimes(
  existing: readonly TimeEntryData[],
  incoming: readonly SavedTime[],
  knows: (carId: string, trackId: string) => boolean,
): MergeReport {
  const best = new Map<string, SavedTime>();
  for (const e of existing) best.set(`${e.trackId}:${e.carId}`, [e.carId, e.trackId, e.timeMs]);

  const report: MergeReport = { entries: [], unknown: 0, added: 0, improved: 0, kept: 0 };
  for (const [carId, trackId, timeMs] of incoming) {
    if (!knows(carId, trackId)) {
      report.unknown++;
      continue;
    }
    const key = `${trackId}:${carId}`;
    const held = best.get(key);
    if (!held) {
      best.set(key, [carId, trackId, timeMs]);
      report.added++;
    } else if (timeMs < held[2]) {
      best.set(key, [carId, trackId, timeMs]);
      report.improved++;
    } else {
      report.kept++;
    }
  }
  report.entries = [...best.values()];
  return report;
}

/** The same fold for a straight replacement: nothing is kept, but a time whose
 * car this build does not have still cannot come in. */
export function replaceTimes(
  incoming: readonly SavedTime[],
  knows: (carId: string, trackId: string) => boolean,
): MergeReport {
  return mergeTimes([], incoming, knows);
}
