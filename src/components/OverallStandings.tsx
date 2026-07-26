"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCar, tracks } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatDurationMs } from "@/lib/format";
import { buildStandings, hasMixedTrackCounts, sortStandings, type StandingsOrder } from "@/lib/standings";
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
    hint: "Alle gefahrenen Zeiten addiert, kürzeste zuerst.",
  },
];

/** The table across every track. A car that is quick everywhere beats one that
 * is untouchable on a single sprint, which the per-track boards cannot show. */
export function OverallStandings() {
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);
  const [order, setOrder] = useState<StandingsOrder>("points");
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
  const ordered = useMemo(
    () => (standings ? sortStandings(standings, order) : null),
    [standings, order],
  );
  const tracksWithTimes = useMemo(
    () => new Set(entries?.map((e) => e.trackId) ?? []).size,
    [entries],
  );
  const mostTracks = useMemo(
    () => (standings ?? []).reduce((max, s) => Math.max(max, s.raced), 0),
    [standings],
  );
  const uneven = standings !== null && hasMixedTrackCounts(standings);

  if (standings === null || ordered === null) {
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
        <p className="max-w-md text-xs text-zinc-500">{activeHint}</p>
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
          Nicht alle Autos sind gleich viele Strecken gefahren. Eine Gesamtzeit ist nur zwischen Autos
          aussagekräftig, die dieselben Strecken hinter sich haben — die abweichenden sind unten markiert.
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
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
            {ordered.map((standing, i) => {
              const car = getCar(standing.carId);
              return (
                <tr key={standing.carId} className="border-t border-zinc-800 bg-zinc-900/50">
                  <td className={`px-3 py-2 text-right font-mono font-bold ${PODIUM[i] ?? "text-zinc-500"}`}>
                    {i + 1}.
                  </td>
                  <td
                    className="px-3 py-2 text-xs font-medium uppercase tracking-wide"
                    style={car ? { color: brandColor(car.make) } : undefined}
                  >
                    {car?.make ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-white">
                    {car ? (
                      <>
                        {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                        <span className="block text-xs text-zinc-600">{car.variant}</span>
                      </>
                    ) : (
                      standing.carId
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      order === "time" && uneven && standing.raced < mostTracks
                        ? "text-amber-300"
                        : "text-zinc-400"
                    }`}
                    title={
                      order === "time" && standing.raced < mostTracks
                        ? `Nur ${standing.raced} von ${mostTracks} Strecken — Gesamtzeit nicht direkt vergleichbar`
                        : undefined
                    }
                  >
                    {standing.raced}
                  </td>
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
              );
            })}
          </tbody>
        </table>
      </div>

      <MakeStandings standings={standings} />
    </>
  );
}
