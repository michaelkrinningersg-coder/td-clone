"use client";

import type { CarData } from "@/lib/data";
import { SECTOR_COUNT, type SimResult } from "@/lib/physics";
import { raceHex } from "@/lib/race";
import { formatTimeMs } from "@/lib/format";

/** Cumulative sector times as the individual splits they are, plus who was
 * quickest through each. A lap time says who was faster; this says where.
 *
 * Ordered by lap time, so the table reads like the result: the winner on top
 * and the losses down the field visible sector by sector. The colour still
 * comes from the grid slot, not from the row, so a car keeps the colour it had
 * on the map.
 *
 * The frame and the title belong to whoever opens the panel; this is the table
 * itself. */
export function SectorTimes({ runs }: { runs: { car: CarData; sim: SimResult }[] }) {
  if (runs.length === 0) return null;

  const fieldSize = runs.length;
  const ordered = runs
    .map((run, gridIndex) => ({ ...run, gridIndex }))
    .sort((a, b) => a.sim.totalTimeMs - b.sim.totalTimeMs);

  // The board carries splits, not running totals: sector 2 is the time spent in
  // sector 2, not the time at the end of it.
  const splits = ordered.map(({ sim }) =>
    sim.sectorTimesMs.map((cumulative, i) => cumulative - (i === 0 ? 0 : sim.sectorTimesMs[i - 1])),
  );
  const bestPerSector = Array.from({ length: SECTOR_COUNT }, (_, i) =>
    Math.min(...splits.map((s) => s[i])),
  );

  return (
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
          {ordered.map(({ car, sim, gridIndex }, row) => (
            <tr key={car.id} className="border-t border-zinc-800">
              <td className="px-4 py-2">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: raceHex(gridIndex, fieldSize) }}
                    aria-hidden
                  />
                  <span className="truncate text-white">{car.model}</span>
                </span>
              </td>
              {splits[row].map((split, i) => {
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
