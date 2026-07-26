"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCars } from "@/lib/data";
import { MAX_RACERS, raceColor } from "@/lib/race";
import { useSelection } from "@/lib/selection";

/** Sticky footer showing the current grid. It follows the user across brands so
 * the selection is never out of sight while browsing, and turns into the way
 * forward once at least one car is picked. */
export function SelectionBar() {
  const { selectedIds, remove, clear, ready } = useSelection();
  const pathname = usePathname();

  // The bar is the way onward from picking cars; on the race pages it would
  // only be in the way.
  const hidden = pathname.startsWith("/race") || pathname.startsWith("/leaderboard");
  if (!ready || hidden || selectedIds.length === 0) return null;

  const selected = getCars(selectedIds);

  return (
    <div className="sticky bottom-0 z-10 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-6 py-3">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Startfeld {selected.length}/{MAX_RACERS}
        </span>

        <ul className="flex flex-1 flex-wrap gap-2">
          {selected.map((car, i) => (
            <li
              key={car.id}
              className={`flex items-center gap-2 rounded-full border ${raceColor(i).border} bg-zinc-900 py-1 pl-2 pr-1 text-sm`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${raceColor(i).bg}`} aria-hidden />
              <span className="text-white">
                {car.make} {car.model}
              </span>
              <button
                onClick={() => remove(car.id)}
                aria-label={`${car.make} ${car.model} entfernen`}
                className="rounded-full px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <button onClick={clear} className="text-sm text-zinc-500 hover:text-zinc-300">
          Leeren
        </button>
        <Link
          href="/tracks"
          className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Strecke wählen
        </Link>
      </div>
    </div>
  );
}
