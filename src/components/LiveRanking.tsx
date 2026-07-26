"use client";

import { useEffect, useState } from "react";
import type { CarData, TrackData } from "@/lib/data";
import { getCar } from "@/lib/data";
import { formatGap, raceColor, type RankedRacer } from "@/lib/race";
import { formatTimeMs } from "@/lib/format";
import { timeStore, type TimeEntryData } from "@/lib/time-store";

type View = "race" | "overall";

interface LiveRankingProps {
  ranked: RankedRacer[];
  cars: CarData[];
  track: TrackData;
  /** Bumped once every car has finished and the times have been stored, so the
   * overall board reloads with the new entries included. */
  savedAt: number;
}

/** The board under the simulation. It defaults to the duel that is actually
 * running; the overall view puts those cars in the context of every time ever
 * set on this track, with cars still driving listed as under way until they
 * cross the line and take their place. */
export function LiveRanking({ ranked, cars, track, savedAt }: LiveRankingProps) {
  // Defaults to the full board so a run is immediately seen in the context of
  // every time set on the track; the duel view is one click away.
  const [view, setView] = useState<View>("overall");
  const carsById = new Map(cars.map((c) => [c.id, c]));

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {view === "race" ? "Live-Ranking" : `Gesamtrangliste · ${track.name}`}
        </h2>
        <div className="flex gap-1 rounded-full border border-zinc-800 p-0.5 text-xs">
          <ViewTab active={view === "race"} onClick={() => setView("race")}>
            Dieses Rennen
          </ViewTab>
          <ViewTab active={view === "overall"} onClick={() => setView("overall")}>
            Gesamtrangliste
          </ViewTab>
        </div>
      </header>

      {view === "race" ? (
        <RaceView ranked={ranked} carsById={carsById} trackLengthM={track.lengthM} />
      ) : (
        <OverallView ranked={ranked} track={track} savedAt={savedAt} />
      )}
    </section>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 font-medium ${
        active ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function RaceView({
  ranked,
  carsById,
  trackLengthM,
}: {
  ranked: RankedRacer[];
  carsById: Map<string, CarData>;
  trackLengthM: number;
}) {
  return (
    <ol className="divide-y divide-zinc-800">
      {ranked.map((racer) => {
        const car = carsById.get(racer.carId);
        const color = raceColor(racer.gridIndex);
        const progress = Math.min(100, (racer.distanceM / trackLengthM) * 100);
        return (
          <li key={racer.carId} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-center font-mono text-lg font-bold text-zinc-500">
                {racer.position}
              </span>
              <span className={`h-3 w-3 shrink-0 rounded-full ${color.bg}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-white">
                  {car ? `${car.make} ${car.model}` : racer.carId}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {racer.finished
                    ? `Ziel · ${formatTimeMs(racer.totalTimeMs)}`
                    : `${racer.speedKph.toFixed(0)} km/h · ${(racer.distanceM / 1000).toFixed(2)} km`}
                </span>
              </span>
              <span className={`shrink-0 font-mono text-sm ${racer.position === 1 ? color.text : "text-zinc-400"}`}>
                {formatGap(racer)}
              </span>
            </div>
            {/* How far along the lap this car is - the clearest read on who is
                actually where, independent of the track's drawn shape. */}
            <div className="mt-2 ml-9 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div className={`h-full rounded-full ${color.bg}`} style={{ width: `${progress}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OverallView({ ranked, track, savedAt }: { ranked: RankedRacer[]; track: TrackData; savedAt: number }) {
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    timeStore
      .getLeaderboard(track.id)
      .then((rows) => !cancelled && setEntries(rows))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [track.id, savedAt]);

  if (entries === null) return <p className="px-4 py-6 text-sm text-zinc-500">Lade Zeiten...</p>;

  const racingIds = new Set(ranked.map((r) => r.carId));
  const stored = entries.map((e) => ({
    key: e.id,
    carId: e.carId,
    timeMs: e.timeMs,
    live: false,
    gridIndex: ranked.find((r) => r.carId === e.carId)?.gridIndex ?? -1,
  }));

  // Cars still driving have no time yet, so they sit at the end until they
  // cross the line - at which point their stored entry takes its real place.
  const running = ranked
    .filter((r) => !r.finished)
    .map((r) => ({ key: `live-${r.carId}`, carId: r.carId, timeMs: null, live: true, gridIndex: r.gridIndex }));

  const rows = [...stored.sort((a, b) => a.timeMs - b.timeMs), ...running];

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-zinc-500">Noch keine Zeiten auf dieser Strecke.</p>;
  }

  return (
    <ol className="max-h-96 divide-y divide-zinc-800 overflow-y-auto">
      {rows.map((row, i) => {
        const car = getCar(row.carId);
        const isRacer = racingIds.has(row.carId);
        const color = row.gridIndex >= 0 ? raceColor(row.gridIndex) : null;
        return (
          <li
            key={row.key}
            className={`flex items-center gap-3 px-4 py-2 ${isRacer ? "bg-zinc-800/60" : ""}`}
          >
            <span className="w-6 shrink-0 text-center font-mono text-sm text-zinc-500">
              {row.timeMs === null ? "–" : i + 1}
            </span>
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${color ? color.bg : "bg-zinc-700"}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-sm text-white">
              {car ? `${car.make} ${car.model} (${car.year})` : row.carId}
            </span>
            <span className="shrink-0 font-mono text-sm text-zinc-300">
              {row.timeMs === null ? <span className="text-zinc-500">unterwegs</span> : formatTimeMs(row.timeMs)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
