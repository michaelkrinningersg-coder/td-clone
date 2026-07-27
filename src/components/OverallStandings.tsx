"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCar, tracks } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatDurationMs } from "@/lib/format";
import {
  buildStandings,
  hasMixedTrackCounts,
  onlyMostTracks,
  sortStandings,
  type StandingsOrder,
} from "@/lib/standings";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import { ResetButton } from "@/components/ResetButton";
import { MakeStandings } from "@/components/MakeStandings";

const PODIUM = ["text-amber-300", "text-zinc-300", "text-orange-400"];

const ORDERS: { id: StandingsOrder; label: string; hint: string }[] = [
  {
    id: "points",
    label: "Punkte",
    hint: "Punkte je Platzierung pro Strecke: der Sieg 5000, jeder Platz dahinter einen weniger, bis Platz 5000. Wer überall vorne liegt, gewinnt — nicht wer eine kurze Strecke beherrscht.",
  },
  {
    id: "gap",
    label: "Ø Rückstand",
    hint: "Mittlerer prozentualer Rückstand auf die jeweilige Streckenbestzeit. Streckenübergreifend vergleichbar, unabhängig von der Streckenlänge.",
  },
  {
    id: "time",
    label: "Gesamtzeit",
    hint: "Alle gefahrenen Zeiten addiert, kürzeste zuerst. Nur Autos mit gleich vielen Strecken — alles andere wäre kein Vergleich.",
  },
];

/** The table across every track. A car that is quick everywhere beats one that
 * is untouchable on a single sprint, which the per-track boards cannot show. */
export function OverallStandings() {
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);
  const [order, setOrder] = useState<StandingsOrder>("points");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all(tracks.map((track) => timeStore.getLeaderboard(track.id)))
      .then((perTrack) => {
        if (!cancelled) setEntries(perTrack.flat());
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const standings = useMemo(() => (entries ? buildStandings(entries) : null), [entries]);
  // The total-time table only compares like with like, so it drops every car
  // that has not covered as much ground as the leaders.
  const ordered = useMemo(() => {
    if (!standings) return null;
    const eligible = order === "time" ? onlyMostTracks(standings) : standings;
    return sortStandings(eligible, order);
  }, [standings, order]);
  // Filtered after ordering, so a searched-for car keeps the place it holds in
  // the whole table rather than being renumbered inside the search result.
  const rows = useMemo(() => {
    if (!ordered) return null;
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return ordered
      .map((standing, i) => ({ standing, position: i + 1, car: getCar(standing.carId) }))
      .filter(({ standing, car }) => {
        if (words.length === 0) return true;
        const haystack = car
          ? `${car.make} ${car.model} ${car.variant} ${car.year}`.toLowerCase()
          : standing.carId.toLowerCase();
        return words.every((w) => haystack.includes(w));
      });
  }, [ordered, deferredQuery]);
  const tracksWithTimes = useMemo(
    () => new Set(entries?.map((e) => e.trackId) ?? []).size,
    [entries],
  );
  const mostTracks = useMemo(
    () => (standings ?? []).reduce((max, s) => Math.max(max, s.raced), 0),
    [standings],
  );
  const uneven = standings !== null && hasMixedTrackCounts(standings);

  if (standings === null || ordered === null || rows === null) {
    return <p className="mt-8 text-zinc-400">Lade Zeiten...</p>;
  }

  if (standings.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-zinc-400">Noch keine Zeiten gefahren.</p>
        <Link href="/" className="mt-3 inline-block text-emerald-400 hover:text-emerald-300">
          Strecke wählen und losfahren →
        </Link>
      </div>
    );
  }

  const activeHint = ORDERS.find((o) => o.id === order)!.hint;

  return (
    <>
      <p className="mt-1 text-sm text-zinc-400">
        {standings.length} {standings.length === 1 ? "Auto" : "Autos"} auf {tracksWithTimes} von {tracks.length}{" "}
        Strecken.
        {rows.length !== ordered.length &&
          ` ${rows.length} davon ${rows.length === 1 ? "passt" : "passen"} zur Suche.`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {ORDERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setOrder(option.id)}
              aria-pressed={order === option.id}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                order === option.id
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Auto suchen..."
          aria-label="Wertung nach einem Auto durchsuchen"
          className="min-w-52 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />
        <p className="max-w-sm text-xs text-zinc-500">{activeHint}</p>
        <span className="ml-auto">
          <ResetButton
            label="Alle Ranglisten zurücksetzen"
            question={`Alle ${entries!.length} Zeiten auf ${tracksWithTimes} ${
              tracksWithTimes === 1 ? "Strecke" : "Strecken"
            } löschen?`}
            confirmLabel="Alles zurücksetzen"
            onConfirm={async () => {
              await timeStore.clear();
              setEntries(null);
              setNonce((n) => n + 1);
            }}
          />
        </span>
      </div>

      {order === "time" && uneven && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {mostTracks === tracks.length
            ? `Nur die ${ordered.length} ${ordered.length === 1 ? "Auto, das" : "Autos, die"} alle ${tracks.length} Strecken gefahren ${ordered.length === 1 ? "ist" : "sind"}.`
            : `Noch ist kein Auto alle ${tracks.length} Strecken gefahren. Gezeigt werden die ${ordered.length} mit den meisten, also je ${mostTracks} ${mostTracks === 1 ? "Strecke" : "Strecken"}.`}{" "}
          {standings.length - ordered.length} von {standings.length} Autos{" "}
          {standings.length - ordered.length === 1 ? "ist" : "sind"} ausgeblendet — eine Gesamtzeit über
          unterschiedlich viele Strecken wäre kein Vergleich.
        </p>
      )}

      {rows.length === 0 && (
        <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Kein Auto in der Wertung passt zur Suche.
        </p>
      )}

      <div className={`mt-4 overflow-x-auto rounded-xl border border-zinc-800 ${rows.length === 0 ? "hidden" : ""}`}>
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Marke</th>
              <th className="px-3 py-2 text-left font-medium">Auto</th>
              <th className="px-3 py-2 text-right font-medium">Strecken</th>
              <th className="px-3 py-2 text-right font-medium">Siege</th>
              <th className="px-3 py-2 text-right font-medium">Podien</th>
              <th className="px-3 py-2 text-right font-medium">Ø Platz</th>
              <th className={`px-3 py-2 text-right font-medium ${order === "gap" ? "text-emerald-400" : ""}`}>
                Ø Rückstand
              </th>
              <th className={`px-3 py-2 text-right font-medium ${order === "time" ? "text-emerald-400" : ""}`}>
                Gesamtzeit
              </th>
              <th
                className={`px-3 py-2 text-right font-medium ${order === "points" ? "text-emerald-400" : ""}`}
              >
                Punkte
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ standing, position, car }) => (
                <tr key={standing.carId} className="border-t border-zinc-800 bg-zinc-900/50">
                  <td
                    className={`px-3 py-2 text-right font-mono font-bold ${PODIUM[position - 1] ?? "text-zinc-500"}`}
                  >
                    {position}.
                  </td>
                  <td
                    className="px-3 py-2 text-xs font-medium uppercase tracking-wide"
                    style={car ? { color: brandColor(car.make) } : undefined}
                  >
                    {car?.make ?? "—"}
                  </td>
                  {/* The whole cell opens the car's page, where the same times
                      are broken down track by track. */}
                  <td className="px-3 py-2 text-white">
                    {car ? (
                      <Link
                        href={`/car?id=${encodeURIComponent(car.id)}`}
                        className="block hover:text-emerald-400"
                        title={`Alle Daten zum ${car.make} ${car.model}`}
                      >
                        {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                        <span className="block text-xs text-zinc-600">{car.variant}</span>
                      </Link>
                    ) : (
                      standing.carId
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.raced}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.wins}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.podiums}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {standing.averagePosition.toFixed(1)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      order === "gap" ? "text-base font-bold text-white" : "text-zinc-400"
                    }`}
                  >
                    {standing.averageGapPercent < 0.05 ? "—" : `+${standing.averageGapPercent.toFixed(1)} %`}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      order === "time" ? "text-base font-bold text-white" : "text-zinc-400"
                    }`}
                  >
                    {formatDurationMs(standing.totalTimeMs)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      order === "points" ? "text-lg font-bold text-white" : "text-zinc-400"
                    }`}
                  >
                    {standing.points}
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MakeStandings standings={standings} />
    </>
  );
}
