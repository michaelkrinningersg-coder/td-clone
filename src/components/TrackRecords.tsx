"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCar, tracks } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatTimeMs } from "@/lib/format";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import { StandingsScope } from "@/components/StandingsScope";
import {
  carInScope,
  carScopeIsEmpty,
  makeRecordCounts,
  trackGroupOf,
  trackInScope,
  EMPTY_CAR_SCOPE,
  type CarScope,
  type TrackGroup,
  type TrackScope,
} from "@/lib/standings-filters";

const GROUP_LABEL: Record<TrackGroup, string> = {
  straight: "Geradeaus",
  oval: "Oval",
  circuit: "Rundstrecke",
};

/** Every track with its record holder, in one place. The per-track boards
 * answer "who is quickest here"; this answers "where have I actually been".
 *
 * The same scopes as the standings apply, and they mean the same thing: with a
 * class chosen, the record shown is that class's record, not the outright one
 * with everything else hidden. */
export function TrackRecords() {
  const [boards, setBoards] = useState<Map<string, TimeEntryData[]> | null>(null);
  const [trackScope, setTrackScope] = useState<TrackScope>("all");
  const [carScope, setCarScope] = useState<CarScope>(EMPTY_CAR_SCOPE);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      tracks.map(async (track) => [track.id, await timeStore.getLeaderboard(track.id)] as const),
    )
      .then((result) => {
        if (!cancelled) setBoards(new Map(result));
      })
      .catch(() => {
        if (!cancelled) setBoards(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scopedTracks = useMemo(() => tracks.filter((t) => trackInScope(t, trackScope)), [trackScope]);

  // The record within the scope, which is why the whole board is filtered
  // rather than only its first row: hiding the outright record holder does not
  // make the next car the record holder unless the board is filtered first.
  const rows = useMemo(() => {
    return scopedTracks.map((track) => {
      const board = (boards?.get(track.id) ?? []).filter((e) => carInScope(getCar(e.carId), carScope));
      const best = board[0] ?? null;
      return { track, best, entries: board.length, car: best ? getCar(best.carId) : undefined };
    });
  }, [scopedTracks, boards, carScope]);

  const makes = useMemo(() => makeRecordCounts(rows.map((r) => ({ make: r.car?.make }))), [rows]);
  const driven = rows.filter((r) => r.best !== null).length;
  const narrowed = trackScope !== "all" || !carScopeIsEmpty(carScope);

  return (
    // The tab carries the title, so the board starts with what it is showing.
    <section>
      <StandingsScope
        trackScope={trackScope}
        onTrackScope={setTrackScope}
        carScope={carScope}
        onCarScope={setCarScope}
      />

      <p className="mt-5 text-sm text-zinc-400">
        {boards === null
          ? "Lade Zeiten..."
          : `${driven} von ${rows.length} Strecken haben eine Bestzeit${narrowed ? " in dieser Auswahl" : ""}.`}
      </p>

      {makes.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Streckenrekorde je Marke
          </h3>
          <ol className="mt-3 flex flex-wrap gap-2">
            {makes.map(({ make, records }) => (
              <li
                key={make}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5"
              >
                <span
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: brandColor(make) }}
                >
                  {make}
                </span>
                <span className="font-mono text-sm font-bold text-white">{records}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-zinc-600">
            {makes.length} {makes.length === 1 ? "Marke hält" : "Marken halten"} zusammen {driven}{" "}
            {driven === 1 ? "Rekord" : "Rekorde"}. Führend ist {makes[0].make} mit {makes[0].records}.
          </p>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Strecke</th>
              <th className="px-3 py-2 text-right font-medium">Länge</th>
              <th className="px-3 py-2 text-left font-medium">Rekordhalter</th>
              <th className="px-3 py-2 text-right font-medium">Zeiten</th>
              <th className="px-3 py-2 text-right font-medium">Bestzeit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ track, best, entries, car }) => (
              <tr key={track.id} className="border-t border-zinc-800 bg-zinc-900/50">
                <td className="px-3 py-2">
                  <Link href={`/leaderboard/${track.id}`} className="text-white hover:text-emerald-400">
                    {track.name}
                  </Link>
                  <span className="block text-xs text-zinc-600">{GROUP_LABEL[trackGroupOf(track)]}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-400">
                  {(track.lengthM / 1000).toFixed(2)} km
                </td>
                <td className="px-3 py-2">
                  {car ? (
                    <Link
                      href={`/car?id=${encodeURIComponent(car.id)}`}
                      className="hover:text-emerald-400"
                      title={`Alle Daten zum ${car.make} ${car.model}`}
                    >
                      <span
                        className="text-xs font-medium uppercase tracking-wide"
                        style={{ color: brandColor(car.make) }}
                      >
                        {car.make}
                      </span>{" "}
                      <span className="text-zinc-300">{car.model}</span>{" "}
                      <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                    </Link>
                  ) : (
                    <span className="text-zinc-600">noch niemand</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">{entries || "—"}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                  {best ? formatTimeMs(best.timeMs) : <span className="text-zinc-700">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
