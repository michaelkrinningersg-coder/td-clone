"use client";

import type { CarData } from "@/lib/data";
import { SECTOR_COUNT, type SimResult } from "@/lib/physics";
import { raceColor } from "@/lib/race";
import { formatTimeMs } from "@/lib/format";

/** Cumulative sector times as the individual splits they are, plus who was
 * quickest through each. A lap time says who was faster; this says where. */
export function SectorTimes({ runs }: { runs: { car: CarData; sim: SimResult }[] }) {
  if (runs.length === 0) return null;

  // The board carries splits, not running totals: sector 2 is the time spent in
  // sector 2, not the time at the end of it.
  const splits = runs.map(({ sim }) =>
    sim.sectorTimesMs.map((cumulative, i) => cumulative - (i === 0 ? 0 : sim.sectorTimesMs[i - 1])),
  );
  const bestPerSector = Array.from({ length: SECTOR_COUNT }, (_, i) =>
    Math.min(...splits.map((s) => s[i])),
  );

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="border-b border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Sektorzeiten
        <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
          Bestzeit je Sektor hervorgehoben
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2 text-left font-medium">Auto</th>
              {Array.from({ length: SECTOR_COUNT }, (_, i) => (
                <th key={i} className="px-3 py-2 text-right font-medium">
                  S{i + 1}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(({ car, sim }, carIndex) => {
              const color = raceColor(carIndex);
              return (
                <tr key={car.id} className="border-t border-zinc-800">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.bg}`} aria-hidden />
                      <span className="truncate text-white">{car.model}</span>
                    </span>
                  </td>
                  {splits[carIndex].map((split, i) => {
                    const isBest = split === bestPerSector[i];
                    return (
                      <td
                        key={i}
                        className={`px-3 py-2 text-right font-mono tabular-nums ${
                          isBest ? "font-bold text-violet-300" : "text-zinc-400"
                        }`}
                      >
                        {formatTimeMs(split)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-white">
                    {formatTimeMs(sim.totalTimeMs)}
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
