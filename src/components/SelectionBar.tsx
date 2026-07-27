"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCars, getTrack } from "@/lib/data";
import { MAX_RACERS, raceHex } from "@/lib/race";
import { powerToWeight } from "@/lib/classes";
import { useSession } from "@/lib/selection";

/** Sticky footer showing the grid being assembled. It follows the user across
 * brands so the selection is never out of sight, and is the way onward once at
 * least one car is picked.
 *
 * Each chip is flex:none: a shrinkable chip would break a car's name over two
 * lines while the bar still has free space, and the bar carrying the primary
 * action must never look broken. */
export function SelectionBar() {
  const { trackId, selectedIds, removeCar, clearCars, ready } = useSession();
  const pathname = usePathname();

  // On the race and leaderboard pages the bar would only be in the way.
  const hidden = pathname.startsWith("/race") || pathname.startsWith("/leaderboard");
  if (!ready || hidden || selectedIds.length === 0) return null;

  const selected = getCars(selectedIds);
  const track = getTrack(trackId ?? "");

  return (
    <div className="sticky bottom-0 z-10 border-t border-[#26211c] bg-[#15110e]/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4 px-6 py-3">
        <span className="label text-[11px] tracking-[0.18em] text-[#8b8177]">
          Feld {selected.length}/{MAX_RACERS}
        </span>

        <ul className="flex flex-1 flex-wrap gap-2">
          {selected.map((car, i) => {
            const hex = raceHex(i, selected.length);
            return (
              <li
                key={car.id}
                className="flex flex-none items-center gap-2 whitespace-nowrap border-l-[3px] bg-[#1a1512] py-[5px] pl-2.5 pr-2"
                style={{ borderLeftColor: hex }}
              >
                <span className="font-[family-name:var(--font-mono)] text-[12px]" style={{ color: hex }}>
                  {i + 1}
                </span>
                <span className="label whitespace-nowrap text-[13px] tracking-[0.06em] text-[#f5efe6]">
                  {car.make} {car.model}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#6d6459]">
                  {(Math.round(powerToWeight(car) * 10) / 10).toLocaleString("de-DE", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
                <button
                  onClick={() => removeCar(car.id)}
                  aria-label={`${car.make} ${car.model} entfernen`}
                  className="px-1 text-[#6d6459] transition-colors hover:text-[#f5efe6]"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        <button onClick={clearCars} className="label text-[11px] tracking-[0.14em] text-[#7d7266] hover:text-[#f5efe6]">
          Leeren
        </button>

        <Link
          href={track ? `/race?cars=${selectedIds.join(",")}&trackId=${track.id}` : "/"}
          className="bg-[#e2492f] px-5 py-[11px] font-[family-name:var(--font-anton)] text-[15px] uppercase tracking-[0.03em] text-[#fff5ef] transition-colors hover:bg-[#f2593e]"
        >
          {track ? "Rennen starten" : "Strecke wählen"}
        </Link>
      </div>
    </div>
  );
}
