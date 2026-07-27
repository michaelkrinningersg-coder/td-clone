"use client";

import { useEffect, useState } from "react";
import type { CarData, TrackData } from "@/lib/data";
import { getCar } from "@/lib/data";
import { formatGap, raceHex, type RankedRacer } from "@/lib/race";
import { formatTimeMs } from "@/lib/format";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import { RankingRow } from "@/components/RankingRow";

interface LiveRankingProps {
  ranked: RankedRacer[];
  cars: CarData[];
  track: TrackData;
  /** Bumped once every car has finished and the times have been stored, so the
   * overall board reloads with the new entries included. */
  savedAt: number;
}

/** A grid slot's colour, from the size of the field it is in. */
function hexFor(gridIndex: number, fieldSize: number): string | undefined {
  return gridIndex >= 0 ? raceHex(gridIndex, fieldSize) : undefined;
}

/** The board under the simulation: this race on the left, every time ever set
 * on this track on the right.
 *
 * Side by side rather than behind a switch, because the two answer different
 * questions at the same moment - who is winning right now, and what that is
 * worth against the field. A car that has crossed the line therefore carries
 * its overall place in the race column too, which is what the pinned block
 * used to be for. */
export function LiveRanking({ ranked, cars, track, savedAt }: LiveRankingProps) {
  const carsById = new Map(cars.map((c) => [c.id, c]));
  const fieldSize = cars.length;
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

  const best = entries?.[0]?.timeMs;
  const overallPositionOf = new Map((entries ?? []).map((entry, i) => [entry.carId, i + 1]));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Board title="Dieses Rennen" note={`${fieldSize} ${fieldSize === 1 ? "Auto" : "Autos"} · ${track.name}`}>
        <ol className="flex flex-col gap-px bg-zinc-800">
          {ranked.map((racer) => {
            const progress = Math.min(100, (racer.distanceM / track.lengthM) * 100);
            const overall = overallPositionOf.get(racer.carId);
            return (
              <RankingRow
                key={racer.carId}
                car={carsById.get(racer.carId)}
                fallbackName={racer.carId}
                gridIndex={racer.gridIndex}
                colorHex={hexFor(racer.gridIndex, fieldSize)}
                position={racer.position}
                // Each car's own clock: running while it drives, stopped at its
                // lap time the moment it crosses the line.
                time={formatTimeMs(racer.elapsedMs)}
                note={
                  racer.finished
                    ? overall !== undefined
                      ? `${formatGap(racer)} · P${overall} gesamt`
                      : formatGap(racer)
                    : `${racer.speedKph.toFixed(0)} km/h · ${progress.toFixed(0)} %`
                }
                progressPercent={progress}
                dense
              />
            );
          })}
        </ol>
      </Board>

      <Board
        title="Gesamtrangliste"
        note={
          entries === null
            ? "lädt ..."
            : `${entries.length} ${entries.length === 1 ? "Zeit" : "Zeiten"} auf ${track.name}`
        }
      >
        <OverallBoard ranked={ranked} entries={entries} fieldSize={fieldSize} best={best} />
      </Board>
    </div>
  );
}

function Board({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
        <span className="truncate text-xs text-zinc-500">{note}</span>
      </header>
      {/* Both columns cap at the same height, so the two boards stay level
          however long the overall one grows. */}
      <div className="max-h-[132rem] overflow-y-auto">{children}</div>
    </section>
  );
}

function OverallBoard({
  ranked,
  entries,
  fieldSize,
  best,
}: {
  ranked: RankedRacer[];
  entries: TimeEntryData[] | null;
  fieldSize: number;
  best: number | undefined;
}) {
  if (entries === null) return <p className="px-4 py-6 text-sm text-zinc-500">Lade Zeiten...</p>;

  const gridIndexOf = (carId: string) => ranked.find((r) => r.carId === carId)?.gridIndex ?? -1;

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

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-zinc-500">Noch keine Zeiten auf dieser Strecke.</p>;
  }

  return (
    <ol className="flex flex-col gap-px bg-zinc-800">
      {rows.map((row) => (
        <RankingRow
          key={row.key}
          car={getCar(row.carId)}
          fallbackName={row.carId}
          gridIndex={row.gridIndex}
          colorHex={hexFor(row.gridIndex, fieldSize)}
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
          dense
        />
      ))}
    </ol>
  );
}
