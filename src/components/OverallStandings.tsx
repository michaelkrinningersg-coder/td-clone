"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCar, tracks } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { buildStandings } from "@/lib/standings";
import { timeStore, type TimeEntryData } from "@/lib/time-store";

const PODIUM = ["text-amber-300", "text-zinc-300", "text-orange-400"];

/** The table across every track. A car that is quick everywhere beats one that
 * is untouchable on a single sprint, which the per-track boards cannot show. */
export function OverallStandings() {
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);

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
  }, []);

  const standings = useMemo(() => (entries ? buildStandings(entries) : null), [entries]);
  const tracksWithTimes = useMemo(
    () => new Set(entries?.map((e) => e.trackId) ?? []).size,
    [entries],
  );

  if (standings === null) {
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

  return (
    <>
      <p className="mt-1 text-sm text-zinc-400">
        {standings.length} {standings.length === 1 ? "Auto" : "Autos"} auf {tracksWithTimes} von {tracks.length}{" "}
        Strecken. Punkte je Platzierung pro Strecke — wer überall vorne liegt, gewinnt, nicht wer eine kurze
        Strecke beherrscht.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Marke</th>
              <th className="px-3 py-2 text-left font-medium">Auto</th>
              <th className="px-3 py-2 text-right font-medium">Strecken</th>
              <th className="px-3 py-2 text-right font-medium">Siege</th>
              <th className="px-3 py-2 text-right font-medium">Podien</th>
              <th className="px-3 py-2 text-right font-medium">Ø Platz</th>
              <th className="px-3 py-2 text-right font-medium">Ø Rückstand</th>
              <th className="px-3 py-2 text-right font-medium">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, i) => {
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
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.raced}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.wins}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.podiums}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {standing.averagePosition.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {standing.averageGapPercent < 0.05 ? "—" : `+${standing.averageGapPercent.toFixed(1)} %`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-lg font-bold text-white">
                    {standing.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
