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
  carRecordCounts,
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

/** Gold, silver, bronze - and the order they stand in, so the winner is in the
 * middle and a step higher, the way a podium looks. */
const PODIUM = [
  { place: 1, ring: "border-amber-400/60", text: "text-amber-300", lift: "sm:-mt-4" },
  { place: 2, ring: "border-zinc-400/50", text: "text-zinc-300", lift: "" },
  { place: 3, ring: "border-orange-500/50", text: "text-orange-400", lift: "sm:mt-3" },
];
const PODIUM_ORDER = [1, 0, 2];

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
  const recordsUnder = (scope: CarScope) =>
    scopedTracks.map((track) => {
      const board = (boards?.get(track.id) ?? []).filter((e) => carInScope(getCar(e.carId), scope));
      const best = board[0] ?? null;
      return { track, best, entries: board.length, car: best ? getCar(best.carId) : undefined };
    });

  const rows = useMemo(
    () => recordsUnder(carScope),
    // recordsUnder closes over the tracks and boards the scope is read against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedTracks, boards, carScope],
  );

  // The marque tally is how you get from one marque to another, so it has to
  // keep showing the ones you are not looking at. It answers "who holds what in
  // this scope" with the marque filter itself left out; everything else on the
  // page answers it with the filter in.
  const makes = useMemo(
    () => makeRecordCounts(recordsUnder({ ...carScope, make: "" }).map((r) => ({ make: r.car?.make }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedTracks, boards, carScope],
  );
  const topCars = useMemo(() => carRecordCounts(rows.map((r) => ({ car: r.car }))).slice(0, 3), [rows]);
  /** Clicking a marque narrows the board to it, and clicking it again lets go.
   * A toggle rather than a one-way jump: the marque you just clicked is the
   * one you are looking at, so it is also the one you want to leave. */
  const toggleMake = (make: string) =>
    setCarScope({ ...carScope, make: carScope.make === make ? "" : make });

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

      {topCars.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Die meisten Streckenrekorde{carScope.make ? ` — ${carScope.make}` : ""}
          </h3>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {PODIUM_ORDER.filter((i) => i < topCars.length).map((i) => {
              const { car, records } = topCars[i];
              const style = PODIUM[i];
              return (
                <li
                  key={car.id}
                  className={`flex flex-col items-center gap-1 rounded-xl border ${style.ring} bg-zinc-900 px-3 py-4 text-center ${style.lift}`}
                >
                  <span className={`font-mono text-xs font-bold ${style.text}`}>{style.place}.</span>
                  <button
                    type="button"
                    onClick={() => toggleMake(car.make)}
                    aria-pressed={carScope.make === car.make}
                    title={
                      carScope.make === car.make
                        ? "Markenfilter aufheben"
                        : `Nur Rekorde von ${car.make} zeigen`
                    }
                    className="rounded text-xs font-medium uppercase tracking-wide underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    style={{ color: brandColor(car.make) }}
                  >
                    {car.make}
                  </button>
                  <Link
                    href={`/car?id=${encodeURIComponent(car.id)}`}
                    className="text-sm text-white hover:text-emerald-400"
                    title={`Alle Daten zum ${car.make} ${car.model}`}
                  >
                    {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                  </Link>
                  <span className={`mt-1 font-mono text-2xl font-bold ${style.text}`}>{records}</span>
                  <span className="text-xs text-zinc-600">
                    {records === 1 ? "Rekord" : "Rekorde"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {makes.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Streckenrekorde je Marke
          </h3>
          <ol className="mt-3 flex flex-wrap gap-2">
            {makes.map(({ make, records }) => {
              const active = carScope.make === make;
              return (
                <li key={make}>
                  <button
                    type="button"
                    onClick={() => toggleMake(make)}
                    aria-pressed={active}
                    title={active ? "Markenfilter aufheben" : `Nur Rekorde von ${make} zeigen`}
                    className={`flex items-center gap-2 rounded-lg border bg-zinc-900 px-3 py-1.5 transition ${
                      active ? "border-emerald-500" : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <span
                      className="text-xs font-medium uppercase tracking-wide"
                      style={{ color: brandColor(make) }}
                    >
                      {make}
                    </span>
                    <span className="font-mono text-sm font-bold text-white">{records}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-zinc-600">
            {makes.length} {makes.length === 1 ? "Marke hält" : "Marken halten"} zusammen{" "}
            {makes.reduce((sum, m) => sum + m.records, 0)} Rekorde. Führend ist {makes[0].make} mit{" "}
            {makes[0].records}.{" "}
            {carScope.make
              ? `Angezeigt sind unten nur die von ${carScope.make} — noch einmal auf die Marke klicken hebt das auf.`
              : "Auf eine Marke klicken zeigt unten nur deren Rekorde."}
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
