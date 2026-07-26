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

/** The board beside the simulation. It opens on every time ever set on this
 * track so a run lands in context immediately, with the duel one click away. */
export function LiveRanking({ ranked, cars, track, savedAt }: LiveRankingProps) {
  const [view, setView] = useState<View>("overall");
  const carsById = new Map(cars.map((c) => [c.id, c]));

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex gap-1 rounded-full border border-zinc-800 bg-zinc-950 p-0.5 text-xs">
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
      className={`flex-1 rounded-full px-3 py-1.5 font-medium ${
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
    <ol className="flex flex-col gap-px bg-zinc-800">
      {ranked.map((racer) => {
        const car = carsById.get(racer.carId);
        const color = raceColor(racer.gridIndex);
        const progress = Math.min(100, (racer.distanceM / trackLengthM) * 100);
        return (
          <li key={racer.carId} className="relative bg-zinc-900 px-4 py-3">
            {/* The lap progress sits behind the row rather than beside it, so
                the bar reads as "how far along" without stealing a column. */}
            <div
              className={`absolute inset-y-0 left-0 ${color.bg} opacity-10 transition-[width] duration-100`}
              style={{ width: `${progress}%` }}
              aria-hidden
            />
            <div className="relative flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  racer.position === 1 ? `${color.bg} text-zinc-950` : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {racer.position}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.bg}`} aria-hidden />
                  <span className="truncate text-sm text-white">
                    {car ? `${car.make} ${car.model}` : racer.carId}
                  </span>
                </div>
                <div className="mt-0.5 truncate pl-[18px] text-xs text-zinc-500">
                  {racer.finished
                    ? `Ziel · ${formatTimeMs(racer.totalTimeMs)}`
                    : `${racer.speedKph.toFixed(0)} km/h · ${(racer.distanceM / 1000).toFixed(2)} km · ${progress.toFixed(0)} %`}
                </div>
              </div>

              <span
                className={`shrink-0 font-mono text-sm ${racer.position === 1 ? color.text : "text-zinc-400"}`}
              >
                {formatGap(racer)}
              </span>
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

  const gridIndexOf = (carId: string) => ranked.find((r) => r.carId === carId)?.gridIndex ?? -1;
  const stored = entries.map((entry) => ({
    key: entry.id,
    carId: entry.carId,
    timeMs: entry.timeMs as number | null,
    gridIndex: gridIndexOf(entry.carId),
  }));

  // Cars still driving have no time yet, so they sit at the end until they
  // cross the line - at which point their stored entry takes its real place.
  const running = ranked
    .filter((r) => !r.finished)
    .map((r) => ({ key: `live-${r.carId}`, carId: r.carId, timeMs: null, gridIndex: r.gridIndex }));

  const rows = [...stored, ...running];
  const best = entries[0]?.timeMs;

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-zinc-500">Noch keine Zeiten auf dieser Strecke.</p>;
  }

  return (
    <ol className="max-h-[28rem] overflow-y-auto">
      {rows.map((row, i) => {
        const car = getCar(row.carId);
        const racing = row.gridIndex >= 0;
        const color = racing ? raceColor(row.gridIndex) : null;
        return (
          <li
            key={row.key}
            className={`flex items-center gap-3 border-b border-zinc-800 px-4 py-2 last:border-b-0 ${
              racing ? "bg-zinc-800/50" : ""
            }`}
          >
            <span className="w-6 shrink-0 text-center font-mono text-sm text-zinc-500">
              {row.timeMs === null ? "–" : i + 1}
            </span>
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${color ? color.bg : "bg-zinc-700"}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm ${racing ? "text-white" : "text-zinc-300"}`}>
                {car ? `${car.make} ${car.model}` : row.carId}
              </div>
              {car && <div className="truncate text-xs text-zinc-600">{car.variant}</div>}
            </div>
            <div className="shrink-0 text-right">
              {row.timeMs === null ? (
                <span className="text-xs text-zinc-500">unterwegs</span>
              ) : (
                <>
                  <div className="font-mono text-sm text-white">{formatTimeMs(row.timeMs)}</div>
                  {best !== undefined && row.timeMs > best && (
                    <div className="font-mono text-xs text-zinc-600">
                      +{((row.timeMs - best) / 1000).toFixed(2)}s
                    </div>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
