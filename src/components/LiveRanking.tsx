"use client";

import { useEffect, useState } from "react";
import type { CarData, TrackData } from "@/lib/data";
import { getCar } from "@/lib/data";
import { formatGap, type RankedRacer } from "@/lib/race";
import { formatTimeMs } from "@/lib/format";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import { RankingRow } from "@/components/RankingRow";

type View = "race" | "overall";

interface LiveRankingProps {
  ranked: RankedRacer[];
  cars: CarData[];
  track: TrackData;
  /** Bumped once every car has finished and the times have been stored, so the
   * overall board reloads with the new entries included. */
  savedAt: number;
}

/** The board under the simulation. It opens on every time ever set on this
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
        const progress = Math.min(100, (racer.distanceM / trackLengthM) * 100);
        return (
          <RankingRow
            key={racer.carId}
            car={carsById.get(racer.carId)}
            fallbackName={racer.carId}
            gridIndex={racer.gridIndex}
            position={racer.position}
            // Each car's own clock: running while it drives, stopped at its lap
            // time the moment it crosses the line.
            time={formatTimeMs(racer.elapsedMs)}
            note={
              racer.finished
                ? formatGap(racer)
                : `${racer.speedKph.toFixed(0)} km/h · ${progress.toFixed(0)} %`
            }
            progressPercent={progress}
          />
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
  const best = entries[0]?.timeMs;

  const stored = entries.map((entry, i) => ({
    key: entry.id,
    carId: entry.carId,
    timeMs: entry.timeMs as number | null,
    position: (i + 1) as number | null,
    gridIndex: gridIndexOf(entry.carId),
  }));

  // A car driving for the first time has no time yet, so it waits at the end
  // until it crosses the line and its entry takes its real place. One that
  // already holds a time keeps that row instead of appearing twice.
  const storedCarIds = new Set(entries.map((e) => e.carId));
  const running = ranked
    .filter((r) => !r.finished && !storedCarIds.has(r.carId))
    .map((r) => ({ key: `live-${r.carId}`, carId: r.carId, timeMs: null, position: null, gridIndex: r.gridIndex }));

  const rows = [...stored, ...running];

  if (rows.length === 0 && ranked.length === 0) {
    return <p className="px-4 py-6 text-sm text-zinc-500">Noch keine Zeiten auf dieser Strecke.</p>;
  }

  return (
    <div className="max-h-[28rem] overflow-y-auto">
      {/* The cars in this race stay pinned at the top in their current running
          order, so they never scroll out of sight - while still appearing in
          their real place in the board below once they have a time. */}
      {ranked.length > 0 && (
        <div className="sticky top-0 z-10 border-b border-zinc-700 bg-zinc-950/95 backdrop-blur">
          <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Dieses Rennen
          </div>
          <ol className="flex flex-col gap-px bg-zinc-800">
            {ranked.map((racer) => (
              <RankingRow
                key={`pinned-${racer.carId}`}
                car={getCar(racer.carId)}
                fallbackName={racer.carId}
                gridIndex={racer.gridIndex}
                position={racer.position}
                time={formatTimeMs(racer.elapsedMs)}
                note={racer.finished ? formatGap(racer) : `${racer.speedKph.toFixed(0)} km/h`}
              />
            ))}
          </ol>
        </div>
      )}

      <ol className="flex flex-col gap-px bg-zinc-800">
        {rows.map((row) => (
          <RankingRow
            key={row.key}
            car={getCar(row.carId)}
            fallbackName={row.carId}
            gridIndex={row.gridIndex}
            position={row.position}
            time={row.timeMs === null ? "—" : formatTimeMs(row.timeMs)}
            note={
              row.timeMs === null
                ? "unterwegs"
                : best === undefined || row.timeMs === best
                  ? "Bestzeit"
                  : `+${((row.timeMs - best) / 1000).toFixed(2)}s`
            }
            highlighted={row.gridIndex >= 0}
          />
        ))}
      </ol>
    </div>
  );
}
