"use client";

import { useMemo } from "react";
import { getCar } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { buildMakeStandings, type CarStanding } from "@/lib/standings";

const PODIUM = ["text-amber-300", "text-zinc-300", "text-orange-400"];

/** The car table rolled up by marque. Ordered by total points, so entering in
 * numbers counts as well as being quick; the per-outing column is there for
 * anyone who wants the other reading. */
export function MakeStandings({ standings }: { standings: CarStanding[] }) {
  const makeStandings = useMemo(
    () => buildMakeStandings(standings, (carId) => getCar(carId)?.make),
    [standings],
  );

  if (makeStandings.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-white">Markenwertung</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Alle Autos einer Marke zusammengezählt. Die Reihenfolge folgt den Gesamtpunkten — wer mit mehr Autos
        antritt, sammelt mehr. Die Spalte &bdquo;Ø je Fahrt&ldquo; zeigt die Wertung ohne diesen Vorteil.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Marke</th>
              <th className="px-3 py-2 text-left font-medium">Bestes Auto</th>
              <th className="px-3 py-2 text-right font-medium">Autos</th>
              <th className="px-3 py-2 text-right font-medium">Fahrten</th>
              <th className="px-3 py-2 text-right font-medium">Siege</th>
              <th className="px-3 py-2 text-right font-medium">Podien</th>
              <th className="px-3 py-2 text-right font-medium">Ø Platz</th>
              <th className="px-3 py-2 text-right font-medium">Ø je Fahrt</th>
              <th className="px-3 py-2 text-right font-medium">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {makeStandings.map((standing, i) => {
              const best = getCar(standing.bestCarId);
              return (
                <tr key={standing.make} className="border-t border-zinc-800 bg-zinc-900/50">
                  <td className={`px-3 py-2 text-right font-mono font-bold ${PODIUM[i] ?? "text-zinc-500"}`}>
                    {i + 1}.
                  </td>
                  <td
                    className="px-3 py-2 text-xs font-medium uppercase tracking-wide"
                    style={{ color: brandColor(standing.make) }}
                  >
                    {standing.make}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">
                    {best ? (
                      <>
                        {best.model} <span className="text-zinc-600">’{String(best.year).slice(2)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.cars}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.entries}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.wins}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.podiums}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {standing.averagePosition.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {Math.round(standing.pointsPerEntry)}
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
    </section>
  );
}
