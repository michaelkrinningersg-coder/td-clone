/** Lap times are the only thing that differs between the two run modes:
 *  - static build (GitHub Pages): times live in the browser's localStorage
 *  - local dev: times are persisted to SQLite through /api/runs
 * Cars, tracks and the physics itself are shared, so a time means the same
 * thing in both modes.
 *
 * The run is always simulated in the browser and the resulting time is handed
 * to the store. That keeps a single code path and guarantees the animation the
 * user watched matches the time that gets stored. */

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
  getLeaderboard(trackId: string): Promise<TimeEntryData[]>;
  /** Drops a single recorded time. Nothing else references an entry, so the
   * board simply re-ranks around the gap. */
  deleteEntry(entryId: string): Promise<void>;
}

const STORAGE_KEY = "td-clone:times";

function readAll(): TimeEntryData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TimeEntryData[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: TimeEntryData[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

const localStorageStore: TimeStore = {
  async saveRun(carId, trackId, timeMs) {
    const all = readAll();
    const index = all.findIndex((e) => e.trackId === trackId && e.carId === carId);

    let entry: TimeEntryData;
    let improved = false;

    if (index === -1) {
      entry = {
        id: `${trackId}:${carId}`,
        carId,
        trackId,
        timeMs,
        createdAt: new Date().toISOString(),
      };
      all.push(entry);
      writeAll(all);
    } else if (isImprovement(all[index].timeMs, timeMs)) {
      entry = { ...all[index], timeMs, createdAt: new Date().toISOString() };
      all[index] = entry;
      improved = true;
      writeAll(all);
    } else {
      entry = all[index]; // existing time stands
    }

    const onTrack = all.filter((e) => e.trackId === trackId);
    const rank = onTrack.filter((e) => e.timeMs < entry.timeMs).length + 1;
    return { entry, rank, totalEntries: onTrack.length, improved };
  },

  async getLeaderboard(trackId) {
    return readAll()
      .filter((e) => e.trackId === trackId)
      .sort((a, b) => a.timeMs - b.timeMs);
  },

  async deleteEntry(entryId) {
    writeAll(readAll().filter((e) => e.id !== entryId));
  },
};

const apiStore: TimeStore = {
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
};

export const isStaticBuild = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

export const timeStore: TimeStore = isStaticBuild ? localStorageStore : apiStore;
