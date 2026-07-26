"use client";

import { useMemo, useState } from "react";
import { brands, cars, tracks } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { DUEL_ROUNDS, DUEL_TEAM_SIZE, duelCalendar, duelTeam } from "@/lib/duel";
import type { DuelState } from "@/lib/use-duel";

/** Picking the two marques. Everything else follows: each side fields its five
 * most powerful cars, one per model, and three tracks are drawn. */
export function DuelSetup({ onStart }: { onStart: (state: DuelState) => void }) {
  const [left, setLeft] = useState<string>("");
  const [right, setRight] = useState<string>("");

  // Only marques with enough cars to field a team are worth offering.
  const eligible = useMemo(() => brands.filter((b) => b.cars.length >= DUEL_TEAM_SIZE), []);

  const leftTeam = left ? duelTeam(cars, left) : [];
  const rightTeam = right ? duelTeam(cars, right) : [];
  const ready = left !== "" && right !== "" && left !== right;

  function start() {
    if (!ready) return;
    onStart({
      makes: [left, right],
      teams: [leftTeam.map((c) => c.id), rightTeam.map((c) => c.id)],
      trackIds: duelCalendar(tracks, DUEL_ROUNDS).map((t) => t.id),
      rounds: [],
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-sm text-zinc-400">
        Zwei Marken, je {DUEL_TEAM_SIZE} Autos, {DUEL_ROUNDS} ausgeloste Strecken. Aufgestellt werden die
        stärksten Autos einer Marke, höchstens eines je Modell. Eine Runde gewinnt, wer die kleinere
        Mannschaftszeit hat — ein einzelner Ausreißer trägt niemanden.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["Marke A", left, setLeft, leftTeam, right],
            ["Marke B", right, setRight, rightTeam, left],
          ] as const
        ).map(([label, value, setValue, team, other]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              {label}
              <select
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-base text-white focus:border-emerald-600 focus:outline-none"
              >
                <option value="">Marke wählen...</option>
                {eligible.map((brand) => (
                  <option key={brand.id} value={brand.name} disabled={brand.name === other}>
                    {brand.name} ({brand.cars.length})
                  </option>
                ))}
              </select>
            </label>

            {team.length > 0 && (
              <ol className="mt-3 flex flex-col gap-1 text-sm">
                {team.map((car, i) => (
                  <li key={car.id} className="flex items-baseline gap-2">
                    <span className="w-4 shrink-0 text-right font-mono text-xs text-zinc-600">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-white">
                      {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-400">{car.powerPs} PS</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={!ready}
          className="rounded-full px-6 py-3 font-semibold text-zinc-950 transition disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: ready ? brandColor(left) : "#3f3f46",
          }}
        >
          Duell starten
        </button>
        <p className="text-sm text-zinc-500">
          {left === "" || right === ""
            ? "Beide Marken wählen."
            : left === right
              ? "Zwei verschiedene Marken wählen."
              : `${left} gegen ${right} — ${DUEL_ROUNDS} Runden, die Strecken werden ausgelost.`}
        </p>
      </div>
    </div>
  );
}
