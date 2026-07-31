/** Lap times are the only thing that differs between the two run modes:
 *  - static build (GitHub Pages): times live in the browser's localStorage
 *  - local dev: times are persisted to SQLite through /api/runs
 * Cars, tracks and the physics itself are shared, so a time means the same
 * thing in both modes.
 *
 * The run is always simulated in the browser and the resulting time is handed
 * to the store. That keeps a single code path and guarantees the animation the
 * user watched matches the time that gets stored. */

import { decodeTimes, encodeTimes } from "@/lib/time-codec";

export interface TimeEntryData {
  id: string;
  carId: string;
  trackId: string;
  timeMs: number;
  createdAt: string;
}

export interface SaveResult {
  entry: TimeEntryData;
  rank: number;
  totalEntries: number;
  /** True when this run beat the car's previous time on the track. */
  improved: boolean;
}

/** Picks which of two runs by the same car on the same track survives. A car
 * holds one time per track - its best - so repeating a run cannot fill the
 * board with copies. The simulation is deterministic, so a repeat normally ties
 * exactly, and a tie keeps the original entry rather than resetting its date. */
export function isImprovement(previousMs: number, candidateMs: number): boolean {
  return candidateMs < previousMs;
}

export interface TimeStore {
  saveRun(carId: string, trackId: string, timeMs: number): Promise<SaveResult>;
  /** Every car of one grid at once. A championship round is a hundred times,
   * and saving them one at a time re-read and re-wrote the whole store a
   * hundred times over - quadratic in a store that is already megabytes. */
  saveRuns(runs: readonly { carId: string; trackId: string; timeMs: number }[]): Promise<SaveResult[]>;
  getLeaderboard(trackId: string): Promise<TimeEntryData[]>;
  /** Drops a single recorded time. Nothing else references an entry, so the
   * board simply re-ranks around the gap. */
  deleteEntry(entryId: string): Promise<void>;
  /** Empties one track's board, or every board when no track is named.
   * Returns how many times were dropped, so the UI can say what it did. */
  clear(trackId?: string): Promise<number>;
}

const STORAGE_KEY = "td-clone:times";

function entryId(trackId: string, carId: string): string {
  return `${trackId}:${carId}`;
}

function readAll(): TimeEntryData[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? decodeTimes(raw) : [];
}

/** Thrown when the browser's storage is full. Its own class so the caller can
 * say something useful instead of relaying "failed to execute setItem". */
export class StorageFullError extends Error {
  constructor(readonly entries: number) {
    super(
      `Der Zeitspeicher des Browsers ist voll (${entries} Zeiten). ` +
        "Neue Zeiten werden nicht mehr gespeichert, bis in der Wertung Ranglisten zurückgesetzt werden.",
    );
    this.name = "StorageFullError";
  }
}

function writeAll(entries: TimeEntryData[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      encodeTimes(entries, Math.floor(Date.now() / 1000)),
    );
  } catch (err) {
    // Every browser names its quota error differently, and some only set the
    // code. What they agree on is that nothing was written.
    const name = err instanceof Error ? err.name : "";
    if (/quota|storage/i.test(name) || (err as { code?: number })?.code === 22) {
      throw new StorageFullError(entries.length);
    }
    throw err;
  }
}

/** The backend the Pages build uses. Exported so tests can drive it against a
 * stubbed localStorage without having to fake a whole build mode. */
/** Folds one run into a list already in memory, and says whether the list
 * changed. Kept apart from the storage so a whole grid can be applied before
 * anything is written. */
function applyRun(
  all: TimeEntryData[],
  carId: string,
  trackId: string,
  timeMs: number,
): { entry: TimeEntryData; improved: boolean; changed: boolean } {
  const index = all.findIndex((e) => e.trackId === trackId && e.carId === carId);
  if (index === -1) {
    const entry: TimeEntryData = {
      id: entryId(trackId, carId),
      carId,
      trackId,
      timeMs,
      createdAt: new Date().toISOString(),
    };
    all.push(entry);
    return { entry, improved: false, changed: true };
  }
  if (isImprovement(all[index].timeMs, timeMs)) {
    const entry = { ...all[index], timeMs, createdAt: new Date().toISOString() };
    all[index] = entry;
    return { entry, improved: true, changed: true };
  }
  return { entry: all[index], improved: false, changed: false }; // existing time stands
}

function rankIn(all: readonly TimeEntryData[], entry: TimeEntryData): SaveResult {
  const onTrack = all.filter((e) => e.trackId === entry.trackId);
  return {
    entry,
    rank: onTrack.filter((e) => e.timeMs < entry.timeMs).length + 1,
    totalEntries: onTrack.length,
    improved: false,
  };
}

export const browserTimeStore: TimeStore = {
  async saveRun(carId, trackId, timeMs) {
    const [result] = await this.saveRuns([{ carId, trackId, timeMs }]);
    return result;
  },

  async saveRuns(runs) {
    const all = readAll();
    const applied = runs.map((r) => applyRun(all, r.carId, r.trackId, r.timeMs));
    if (applied.some((a) => a.changed)) writeAll(all);
    return applied.map((a) => ({ ...rankIn(all, a.entry), improved: a.improved }));
  },

  async getLeaderboard(trackId) {
    return readAll()
      .filter((e) => e.trackId === trackId)
      .sort((a, b) => a.timeMs - b.timeMs);
  },

  async deleteEntry(entryId) {
    writeAll(readAll().filter((e) => e.id !== entryId));
  },

  async clear(trackId) {
    const all = readAll();
    const kept = trackId === undefined ? [] : all.filter((e) => e.trackId !== trackId);
    writeAll(kept);
    return all.length - kept.length;
  },
};

const apiStore: TimeStore = {
  async saveRuns(runs) {
    // Sequential on purpose: the board's ranking is read back per save, and
    // firing them together would race each other for it.
    const results: SaveResult[] = [];
    for (const run of runs) results.push(await this.saveRun(run.carId, run.trackId, run.timeMs));
    return results;
  },

  async saveRun(carId, trackId, timeMs) {
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carId, trackId, timeMs }),
    });
    if (!res.ok) throw new Error(`Speichern fehlgeschlagen: ${res.status}`);
    return (await res.json()) as SaveResult;
  },

  async getLeaderboard(trackId) {
    const res = await fetch(`/api/tracks/${trackId}/leaderboard`);
    if (!res.ok) throw new Error(`Rangliste laden fehlgeschlagen: ${res.status}`);
    return (await res.json()) as TimeEntryData[];
  },

  async deleteEntry(entryId) {
    const res = await fetch(`/api/runs?id=${encodeURIComponent(entryId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Löschen fehlgeschlagen: ${res.status}`);
  },

  async clear(trackId) {
    // `all=1` has to be explicit: a missing trackId must never be read as
    // "wipe everything" by accident.
    const query = trackId === undefined ? "all=1" : `trackId=${encodeURIComponent(trackId)}`;
    const res = await fetch(`/api/runs?${query}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Zurücksetzen fehlgeschlagen: ${res.status}`);
    return ((await res.json()) as { deleted: number }).deleted;
  },
};

export const isStaticBuild = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

export const timeStore: TimeStore = isStaticBuild ? browserTimeStore : apiStore;
