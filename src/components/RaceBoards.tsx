"use client";

import { useEffect, useState } from "react";
import type { CarData, TrackData } from "@/lib/data";
import { getCar } from "@/lib/data";
import { formatGap, raceHex, type RankedRacer } from "@/lib/race";
import { formatTimeMs } from "@/lib/format";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import { RankingRow } from "@/components/RankingRow";

/** The two boards around a race: the field as it runs, and every time ever set
 * on this track.
 *
 * They are separate components because they sit in different columns - the race
 * under the map, the overall board down the right-hand side - but they share
 * one set of stored times, which is why the loading lives in a hook the caller
 * holds rather than inside either board. */

/** A grid slot's colour, from the size of the field it is in. */
function hexFor(gridIndex: number, fieldSize: number): string | undefined {
  return gridIndex >= 0 ? raceHex(gridIndex, fieldSize) : undefined;
}

/** Every time on this track, reloaded whenever `savedAt` moves - which the
 * runner bumps once a finished race has been written away. */
export function useTrackLeaderboard(trackId: string, savedAt: number): TimeEntryData[] | null {
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    timeStore
      .getLeaderboard(trackId)
      .then((rows) => !cancelled && setEntries(rows))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [trackId, savedAt]);

  return entries;
}

export function Board({
  title,
  note,
  bodyClassName,
  children,
}: {
  title: string;
  note: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
        <span className="truncate text-xs text-zinc-500">{note}</span>
      </header>
      <div className={`overflow-y-auto ${bodyClassName ?? "max-h-[132rem]"}`}>{children}</div>
    </section>
  );
}

/** The race itself. A car that has crossed the line carries the place it has
 * taken on the whole board as well as its gap, so the two columns answer their
 * questions without being read against each other. */
export function RaceBoard({
  ranked,
  cars,
  track,
  entries,
}: {
  ranked: RankedRacer[];
  cars: CarData[];
  track: TrackData;
  entries: TimeEntryData[] | null;
}) {
  const carsById = new Map(cars.map((c) => [c.id, c]));
  const fieldSize = cars.length;
  const overallPositionOf = new Map((entries ?? []).map((entry, i) => [entry.carId, i + 1]));

  return (
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
  );
}

/** Every time ever set here. The cars from this race keep their grid colour on
 * the edge of the row and their tinted background, so they are findable in a
 * board of thousands; the text itself is in the marque's colours like anywhere
 * else on a board that is not a race. */
export function OverallBoard({
  ranked,
  entries,
  track,
  fieldSize,
  bodyClassName,
}: {
  ranked: RankedRacer[];
  entries: TimeEntryData[] | null;
  track: TrackData;
  fieldSize: number;
  bodyClassName?: string;
}) {
  return (
    <Board
      title="Gesamtrangliste"
      note={
        entries === null
          ? "lädt ..."
          : `${entries.length} ${entries.length === 1 ? "Zeit" : "Zeiten"} auf ${track.name}`
      }
      bodyClassName={bodyClassName}
    >
      <OverallRows ranked={ranked} entries={entries} fieldSize={fieldSize} />
    </Board>
  );
}

function OverallRows({
  ranked,
  entries,
  fieldSize,
}: {
  ranked: RankedRacer[];
  entries: TimeEntryData[] | null;
  fieldSize: number;
}) {
  if (entries === null) return <p className="px-4 py-6 text-sm text-zinc-500">Lade Zeiten...</p>;

  const best = entries[0]?.timeMs;
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
          brandColored
          dense
          noteWidthClass="w-24"
        />
      ))}
    </ol>
  );
}
