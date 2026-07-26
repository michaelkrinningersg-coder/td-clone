"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCars, getTrack } from "@/lib/data";
import { MAX_RACERS, raceColor } from "@/lib/race";
import { useSession } from "@/lib/selection";

/** Sticky footer showing the grid being assembled. It follows the user across
 * brands so the selection is never out of sight, and is the way onward once at
 * least one car is picked. */
export function SelectionBar() {
  const { trackId, selectedIds, removeCar, clearCars, ready } = useSession();
  const pathname = usePathname();

  // On the race and leaderboard pages the bar would only be in the way.
  const hidden = pathname.startsWith("/race") || pathname.startsWith("/leaderboard");
  if (!ready || hidden || selectedIds.length === 0) return null;

  const selected = getCars(selectedIds);
  const track = getTrack(trackId ?? "");

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
                onClick={() => removeCar(car.id)}
                aria-label={`${car.make} ${car.model} entfernen`}
                className="rounded-full px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <button onClick={clearCars} className="text-sm text-zinc-500 hover:text-zinc-300">
          Leeren
        </button>

        {track ? (
          <Link
            href={`/race?cars=${selectedIds.join(",")}&trackId=${track.id}`}
            className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Rennen auf {track.name}
          </Link>
        ) : (
          <Link
            href="/"
            className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Strecke wählen
          </Link>
        )}
      </div>
    </div>
  );
}
