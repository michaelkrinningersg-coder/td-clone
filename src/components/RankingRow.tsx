"use client";

import { useState } from "react";
import type { CarData } from "@/lib/data";
import { raceColor } from "@/lib/race";
import { brandColor } from "@/lib/brand-colors";

/** One line of a ranking, shared by the live board and the track board so both
 * read the same way: marque in its own column, then the car, then its specs,
 * with the time and the position closing the line on the right.
 *
 * The columns collapse on narrow screens - specs go first, then the marque -
 * rather than letting the line wrap and stop being one line. */
export function RankingRow({
  car,
  fallbackName,
  gridIndex,
  colorHex,
  position,
  time,
  note,
  progressPercent,
  highlighted,
  podiumClass,
  brandColored,
  onDelete,
}: {
  car: CarData | undefined;
  /** Shown when the car is no longer in the dataset. */
  fallbackName: string;
  /** Slot in the starting grid; -1 for a car that is not in this race. */
  gridIndex: number;
  /** Overrides the grid colour, for fields bigger than the racing palette. */
  colorHex?: string;
  /** Null while a car is still driving and has no place yet. */
  position: number | null;
  time: string;
  /** Gap to the leader, or a live readout while the car is still driving.
   * Sits before the time so that time and position stay side by side. */
  note?: string;
  /** Fills the row behind the content to show how far along the lap the car is. */
  progressPercent?: number;
  highlighted?: boolean;
  /** Colours the position for places 1-3 on boards that have no grid colours. */
  podiumClass?: string;
  /** Tints the marque column with that marque's colour. Off during a race,
   * where the grid colours carry the meaning instead. */
  brandColored?: boolean;
  /** When given, the row offers to delete its recorded time. */
  onDelete?: () => void | Promise<void>;
}) {
  const color = gridIndex >= 0 ? raceColor(gridIndex) : null;
  const hex = gridIndex >= 0 ? (colorHex ?? color!.hex) : null;
  // Deleting a time cannot be undone, so the × only arms the row and a second,
  // differently-worded button does the deed.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await onDelete?.();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li
      className={`relative border-l-4 px-3 py-2.5 ${highlighted ? "bg-emerald-950/30" : "bg-zinc-900"}`}
      style={{ borderLeftColor: hex ?? "#3f3f46" }}
    >
      {progressPercent !== undefined && (
        <div
          className="absolute inset-y-0 left-0 opacity-10 transition-[width] duration-100"
          style={{ width: `${progressPercent}%`, backgroundColor: hex ?? "#52525b" }}
          aria-hidden
        />
      )}

      <div className="relative flex items-center gap-3">
        <span
          className="w-24 shrink-0 truncate text-xs font-medium uppercase tracking-wide text-zinc-500 sm:w-32"
          style={brandColored && car ? { color: brandColor(car.make) } : undefined}
        >
          {car?.make ?? "—"}
        </span>

        <span
          className={`min-w-0 flex-1 truncate text-sm ${hex ? "" : "text-zinc-200"}`}
          style={hex ? { color: hex } : undefined}
        >
          {car ? car.model : fallbackName}
          {car && <span className="text-zinc-600"> ’{String(car.year).slice(2)}</span>}
        </span>

        <span className="hidden min-w-0 flex-1 truncate text-xs text-zinc-500 lg:block">
          {car ? `${car.variant} · ${car.powerPs} PS · ${car.drivetrain}` : "Auto nicht mehr im Bestand"}
        </span>

        <span className="hidden w-32 shrink-0 truncate text-right font-mono text-xs text-zinc-500 sm:block">
          {note ?? ""}
        </span>

        <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-white">{time}</span>

        <span
          className={`w-9 shrink-0 text-right font-mono text-lg font-bold ${
            podiumClass ?? (position === 1 ? "" : "text-zinc-500")
          }`}
          style={!podiumClass && position === 1 ? { color: hex ?? "#fff" } : undefined}
        >
          {position === null ? "–" : `${position}.`}
        </span>

        {onDelete &&
          (confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {busy ? "..." : "Löschen"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-full px-2 py-1 text-xs text-zinc-400 hover:text-white"
              >
                Abbrechen
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              aria-label="Eintrag aus der Rangliste entfernen"
              title="Eintrag entfernen"
              className="shrink-0 rounded-full px-2 py-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-white"
            >
              ×
            </button>
          ))}
      </div>
    </li>
  );
}
