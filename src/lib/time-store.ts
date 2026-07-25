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
}

export interface TimeStore {
  saveRun(carId: string, trackId: string, timeMs: number): Promise<SaveResult>;
  getLeaderboard(trackId: string): Promise<TimeEntryData[]>;
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
    const entry: TimeEntryData = {
      id: `${trackId}:${carId}:${Date.now()}`,
      carId,
      trackId,
      timeMs,
      createdAt: new Date().toISOString(),
    };
    const all = readAll();
    all.push(entry);
    writeAll(all);

    const onTrack = all.filter((e) => e.trackId === trackId);
    const rank = onTrack.filter((e) => e.timeMs < timeMs).length + 1;
    return { entry, rank, totalEntries: onTrack.length };
  },

  async getLeaderboard(trackId) {
    return readAll()
      .filter((e) => e.trackId === trackId)
      .sort((a, b) => a.timeMs - b.timeMs);
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
};

export const isStaticBuild = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

export const timeStore: TimeStore = isStaticBuild ? localStorageStore : apiStore;
