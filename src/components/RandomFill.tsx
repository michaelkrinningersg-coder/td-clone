"use client";

import { useState } from "react";
import type { CarData } from "@/lib/data";
import { MAX_RACERS } from "@/lib/race";
import { randomGrid } from "@/lib/random-grid";
import { useSession } from "@/lib/selection";

/** Fills the grid at random out of whatever the filters have left standing.
 *
 * Cars that already hold a time on this track are always left out, whether or
 * not the filter for that is on: the point of a random grid is to see something
 * that has not run here yet. */
export function RandomFill({
  pool,
  timedCarIds,
  trackName,
}: {
  pool: CarData[];
  timedCarIds: ReadonlySet<string> | undefined;
  trackName?: string;
}) {
  const { setCars } = useSession();
  const [count, setCount] = useState<number>(MAX_RACERS);
  const [onePerMake, setOnePerMake] = useState(true);
  const [drawn, setDrawn] = useState<number | null>(null);

  const untimed = timedCarIds ? pool.filter((car) => !timedCarIds.has(car.id)) : pool;

  function draw() {
    const grid = randomGrid(pool, {
      count,
      excludeIds: timedCarIds,
      onePerMake,
    });
    setCars(grid.map((car) => car.id));
    setDrawn(grid.length);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <button
        type="button"
        onClick={draw}
        disabled={untimed.length === 0}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        🎲 Startfeld zufällig füllen
      </button>

      <label className="flex items-center gap-2 text-sm text-zinc-400">
        Anzahl
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Anzahl zufälliger Autos"
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-white focus:border-emerald-600 focus:outline-none"
        >
          {Array.from({ length: MAX_RACERS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-zinc-400">
        <input
          type="checkbox"
          checked={onePerMake}
          onChange={(e) => setOnePerMake(e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
        />
        je Marke nur ein Auto
      </label>

      <p className="ml-auto text-xs text-zinc-500">
        {drawn !== null && drawn < count
          ? `Nur ${drawn} ${drawn === 1 ? "Auto" : "Autos"} verfügbar — die Regeln lassen nicht mehr zu.`
          : `Zieht aus ${untimed.length.toLocaleString("de-DE")} Autos${
              trackName ? ` ohne Zeit auf ${trackName}` : ""
            }, die zu den Filtern passen.`}
      </p>
    </div>
  );
}
