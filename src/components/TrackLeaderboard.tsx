"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { getCar, type TrackData } from "@/lib/data";
import { buildTrackPath, toSvgPath } from "@/lib/track-geometry";
import { formatTimeMs } from "@/lib/format";
import { useTrackTimes } from "@/lib/use-track-times";
import { timeStore } from "@/lib/time-store";
import { RankingRow } from "@/components/RankingRow";

const PADDING = 20;

/** Places 1-3 get their own colour so the top of the board reads at a glance. */
const PODIUM = ["text-amber-300", "text-zinc-300", "text-orange-400"];

export function TrackLeaderboard({ track, highlight }: { track: TrackData; highlight?: string }) {
  const { entries, reload } = useTrackTimes(track.id);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => {
    if (!entries) return null;
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return entries
      .map((entry, i) => ({ entry, position: i + 1, car: getCar(entry.carId) }))
      .filter(({ entry, car }) => {
        if (words.length === 0) return true;
        const haystack = car
          ? `${car.make} ${car.model} ${car.variant} ${car.year}`.toLowerCase()
          : entry.carId.toLowerCase();
        return words.every((w) => haystack.includes(w));
      });
  }, [entries, deferredQuery]);

  const path = buildTrackPath(track.segments, Math.max(5, track.lengthM / 400));
  const width = path.maxX - path.minX;
  const height = path.maxY - path.minY;
  const best = entries?.[0];

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
        ← Alle Strecken
      </Link>

      <header className="mt-2 flex flex-wrap items-center gap-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <svg
          viewBox={`${path.minX - PADDING} ${path.minY - PADDING} ${width + PADDING * 2} ${height + PADDING * 2}`}
          className="h-24 w-32 shrink-0 text-emerald-500"
        >
          <path
            d={toSvgPath(path)}
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.max(width, height) / 80}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">{track.name}</h1>
          <p className="text-sm text-zinc-400">
            {track.type === "SPRINT" ? "Sprint" : "Rundstrecke"} · {(track.lengthM / 1000).toFixed(2)} km ·{" "}
            {entries === null ? "…" : `${entries.length} ${entries.length === 1 ? "Zeit" : "Zeiten"}`}
          </p>
        </div>
        {best && (
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Bestzeit</div>
            <div className="font-mono text-2xl font-bold text-emerald-400">{formatTimeMs(best.timeMs)}</div>
          </div>
        )}
      </header>

      {entries !== null && entries.length > 3 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rangliste durchsuchen..."
          aria-label="Rangliste durchsuchen"
          className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />
      )}

      {rows === null ? (
        <p className="mt-8 text-zinc-400">Lade Zeiten...</p>
      ) : entries!.length === 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-zinc-400">Noch keine Zeiten auf dieser Strecke.</p>
          <Link href="/" className="mt-3 inline-block text-emerald-400 hover:text-emerald-300">
            Strecke wählen und losfahren →
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Kein Auto in der Rangliste passt zur Suche.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-px overflow-hidden rounded-xl bg-zinc-800">
          {rows.map(({ entry, position, car }) => (
            <RankingRow
              key={entry.id}
              car={car}
              fallbackName={entry.carId}
              // The board is not a race, so nothing here carries a grid colour;
              // the top three are marked by their position instead.
              gridIndex={-1}
              position={position}
              time={formatTimeMs(entry.timeMs)}
              note={
                position === 1
                  ? "Bestzeit"
                  : `+${((entry.timeMs - (best?.timeMs ?? entry.timeMs)) / 1000).toFixed(2)}s`
              }
              highlighted={entry.id === highlight}
              podiumClass={position <= 3 ? PODIUM[position - 1] : undefined}
              onDelete={async () => {
                await timeStore.deleteEntry(entry.id);
                reload();
              }}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
