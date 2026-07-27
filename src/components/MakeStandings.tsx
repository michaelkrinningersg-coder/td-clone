"use client";

import { useMemo, useState } from "react";
import { getCar } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { bestPerMake, buildMakeStandings, type CarStanding } from "@/lib/standings";

const PODIUM = ["text-amber-300", "text-zinc-300", "text-orange-400"];

/** How many cars a marque may score with. */
const SQUADS: { label: string; limit: number | null; hint: string }[] = [
  {
    label: "Beste 5",
    limit: 5,
    hint: "Nur die fünf punktbesten Autos je Marke. Gleich große Mannschaften, also zählt die Qualität statt der Menge.",
  },
  {
    label: "Beste 10",
    limit: 10,
    hint: "Nur die zehn punktbesten Autos je Marke — etwas mehr Tiefe, immer noch derselbe Kader für alle.",
  },
  {
    label: "Alle Autos",
    limit: null,
    hint: "Jedes Auto der Marke zählt. Wer mit mehr Autos antritt, sammelt mehr — die Spalte „Ø je Fahrt“ zeigt die Wertung ohne diesen Vorteil.",
  },
];

/** The car table rolled up by marque. Ordered by total points, so entering in
 * numbers counts as well as being quick; the per-outing column is there for
 * anyone who wants the other reading. */
export function MakeStandings({ standings }: { standings: CarStanding[] }) {
  const [squad, setSquad] = useState(SQUADS.length - 1);
  const makeStandings = useMemo(() => {
    const makeOf = (carId: string) => getCar(carId)?.make;
    return buildMakeStandings(bestPerMake(standings, makeOf, SQUADS[squad].limit), makeOf);
  }, [standings, squad]);

  if (makeStandings.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-white">Markenwertung</h2>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {SQUADS.map((option, i) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setSquad(i)}
              aria-pressed={squad === i}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                squad === i ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="max-w-xl text-xs text-zinc-500">{SQUADS[squad].hint}</p>
      </div>

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
