"use client";

import { useMemo, useState } from "react";
import { getCar, getTrack } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatTimeMs } from "@/lib/format";
import { raceHex } from "@/lib/race";
import {
  championshipStandings,
  currentTrackId,
  gridOrder,
  isFinished,
  type CarResult,
  type ChampionshipState,
} from "@/lib/championship";
import { RaceRunner } from "@/components/RaceRunner";

const PODIUM = ["text-amber-300", "text-zinc-300", "text-orange-400"];

/** A championship in progress: the whole field on track, then the table.
 *
 * Times are written to the ordinary leaderboards as well - a lap driven is a
 * lap driven, and a championship should feed the records rather than run in a
 * parallel world. */
export function ChampionshipRunner({
  state,
  onRoundFinished,
}: {
  state: ChampionshipState;
  onRoundFinished: (results: CarResult[]) => void;
}) {
  // A finished round is held here until it is confirmed rather than filed at
  // once: committing it changes the state, which swaps in the next track, and
  // the result would be gone before anyone had read it.
  const [finishedRound, setFinishedRound] = useState<CarResult[] | null>(null);

  const standings = useMemo(
    () => championshipStandings(state.carIds, state.rounds),
    [state.carIds, state.rounds],
  );
  const trackId = currentTrackId(state);
  const track = trackId ? getTrack(trackId) : undefined;
  const gridCars = useMemo(
    () => gridOrder(state).map((id) => getCar(id)).filter((c) => c !== undefined),
    [state],
  );
  const done = isFinished(state);

  return (
    <div className="mt-6 flex flex-col gap-8">
      {!done && track && (
        <section>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-bold text-white">
              Lauf {state.rounds.length + 1} von {state.trackIds.length}: {track.name}
            </h2>
            <span className="text-sm text-zinc-400">
              {gridCars.length} Autos gemeinsam am Start
              {state.rounds.length > 0 && " · aufgestellt nach dem Meisterschaftsstand"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {gridCars.map((car, i) => (
              <span
                key={car.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: raceHex(i, gridCars.length) }}
                  aria-hidden
                />
                <span style={{ color: brandColor(car.make) }}>{car.make}</span>
                {car.model}
              </span>
            ))}
          </div>

          {/* Keyed so every round starts a fresh runner rather than replaying
              the previous one's state. */}
          <RaceRunner
            key={state.rounds.length}
            cars={gridCars}
            track={track}
            onFinish={setFinishedRound}
            outro={
              <button
                type="button"
                onClick={() => {
                  if (!finishedRound) return;
                  setFinishedRound(null);
                  onRoundFinished(finishedRound);
                }}
                className="mt-4 rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                {state.rounds.length + 1 < state.trackIds.length
                  ? "Lauf werten und weiter"
                  : "Meisterschaft abschließen"}
              </button>
            }
          />
        </section>
      )}

      {done && (
        <section className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-5">
          <div className="text-sm text-zinc-400">Meisterschaft entschieden</div>
          <div className="mt-1 text-2xl font-bold text-white">
            {(() => {
              const champion = getCar(standings[0]?.carId ?? "");
              return champion ? `${champion.make} ${champion.model} ’${String(champion.year).slice(2)}` : "—";
            })()}
          </div>
          <div className="font-mono text-xl text-emerald-400">{standings[0]?.points ?? 0} Punkte</div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold text-white">Meisterschaftsstand</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {state.rounds.length === 0
            ? `Noch kein Lauf gewertet. Punkte je Lauf: ${state.carIds.length} für den Sieg, jeder Platz dahinter einen weniger, der letzte bekommt 1.`
            : `Nach ${state.rounds.length} von ${state.trackIds.length} ${
                state.trackIds.length === 1 ? "Lauf" : "Läufen"
              }. Gewertet wird über das ganze Feld: ${state.carIds.length} Punkte für den Sieg, 1 für den letzten Platz.`}
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-right font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Marke</th>
                <th className="px-3 py-2 text-left font-medium">Auto</th>
                <th className="px-3 py-2 text-right font-medium">Läufe</th>
                <th className="px-3 py-2 text-right font-medium">Siege</th>
                <th className="px-3 py-2 text-right font-medium">Podien</th>
                <th className="px-3 py-2 text-right font-medium">Letzter</th>
                <th className="px-3 py-2 text-right font-medium">Gesamtzeit</th>
                <th className="px-3 py-2 text-right font-medium">Punkte</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, i) => {
                const car = getCar(standing.carId);
                const racing = !done;
                return (
                  <tr
                    key={standing.carId}
                    className={`border-t border-zinc-800 ${racing && !done ? "bg-emerald-950/30" : "bg-zinc-900/50"}`}
                  >
                    <td className={`px-3 py-2 text-right font-mono font-bold ${PODIUM[i] ?? "text-zinc-500"}`}>
                      {i + 1}.
                    </td>
                    <td
                      className="px-3 py-2 text-xs font-medium uppercase tracking-wide"
                      style={car ? { color: brandColor(car.make) } : undefined}
                    >
                      {car?.make ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-white">
                      {car ? (
                        <>
                          {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                        </>
                      ) : (
                        standing.carId
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.rounds}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.wins}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">{standing.podiums}</td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {standing.lastPosition === null ? "—" : `${standing.lastPosition}.`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {standing.totalTimeMs === 0 ? "—" : formatTimeMs(standing.totalTimeMs)}
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
    </div>
  );
}
