"use client";

import { useMemo, useState } from "react";
import { getCar, getTrack } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatTimeMs } from "@/lib/format";
import {
  championshipStandings,
  currentTrackId,
  gridOrder,
  isFinished,
  recordRound,
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

  // The table follows the chequered flag, not the confirmation: the moment the
  // last car is home the round is scored into a provisional standing, so the
  // championship reads live. Confirming only makes it permanent.
  const confirmed = useMemo(
    () => championshipStandings(state.carIds, state.rounds),
    [state.carIds, state.rounds],
  );
  const standings = useMemo(
    () =>
      finishedRound
        ? championshipStandings(state.carIds, recordRound(state, finishedRound).rounds)
        : confirmed,
    [state, finishedRound, confirmed],
  );
  // Where each car stood before this round, so the table can show what the
  // round moved. Only from the second round on: before the first, every car is
  // on nought and the order it happens to be in is not a standing to move from.
  const showsMovement = finishedRound !== null && state.rounds.length > 0;
  const positionBefore = new Map(confirmed.map((s, i) => [s.carId, i + 1]));
  const trackId = currentTrackId(state);
  const track = trackId ? getTrack(trackId) : undefined;
  const gridCars = useMemo(
    () => gridOrder(state).map((id) => getCar(id)).filter((c) => c !== undefined),
    [state],
  );
  const done = isFinished(state);

  const roundNumber = state.rounds.length + 1;
  const lastRound = state.trackIds.length;

  function confirmRound() {
    if (!finishedRound) return;
    setFinishedRound(null);
    onRoundFinished(finishedRound);
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* The step out of the round sits at the top and follows the page, so it
          is reachable the moment the field is home instead of below the whole
          result. */}
      {finishedRound && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-700 bg-emerald-950/90 px-4 py-3 backdrop-blur">
          <div className="text-sm text-zinc-300">
            <span className="font-semibold text-white">Lauf {roundNumber} im Ziel</span>
            {track && <span className="text-zinc-400"> · {track.name}</span>}
            <span className="text-zinc-400"> · Stand vorläufig gewertet</span>
          </div>
          {/* The table is a long way down past thirty cars, so the bar carries
              the way there as well as the way on. */}
          <a
            href="#meisterschaftsstand"
            className="rounded-full border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-300 hover:border-emerald-500 hover:text-white"
          >
            Zum Stand ↓
          </a>
          <button
            type="button"
            onClick={confirmRound}
            className="ml-auto rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            {roundNumber < lastRound ? "Lauf werten und weiter" : "Meisterschaft abschließen"}
          </button>
        </div>
      )}

      {!done && track && (
        <section>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-bold text-white">
              Lauf {roundNumber} von {lastRound}: {track.name}
            </h2>
            <span className="text-sm text-zinc-400">
              {gridCars.length} Autos gemeinsam am Start
              {state.rounds.length > 0 && " · aufgestellt nach dem Meisterschaftsstand"}
            </span>
          </div>

          {/* No list of the field here - "Dieses Rennen" names every car in
              its grid colour and keeps doing so while they run. Keyed so every
              round starts a fresh runner rather than replaying the previous
              one's state. */}
          <RaceRunner
            key={state.rounds.length}
            cars={gridCars}
            track={track}
            onFinish={setFinishedRound}
            outro={<p className="mt-3 text-sm text-zinc-400">Weiter geht es über die Leiste oben.</p>}
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

      <section id="meisterschaftsstand" className="scroll-mt-20">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-bold text-white">Meisterschaftsstand</h2>
          {finishedRound && (
            <span className="rounded-full border border-emerald-700 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              Lauf {roundNumber} vorläufig eingerechnet
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          {state.rounds.length === 0 && !finishedRound
            ? `Noch kein Lauf gewertet. Punkte je Lauf: ${state.carIds.length} für den Sieg, jeder Platz dahinter einen weniger, der letzte bekommt 1.`
            : `Nach ${state.rounds.length + (finishedRound ? 1 : 0)} von ${state.trackIds.length} ${
                state.trackIds.length === 1 ? "Lauf" : "Läufen"
              }. Gewertet wird über das ganze Feld: ${state.carIds.length} Punkte für den Sieg, 1 für den letzten Platz.`}
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-right font-medium">#</th>
                {showsMovement && (
                  <th className="px-2 py-2 text-right font-medium" title="Veränderung durch diesen Lauf">
                    ±
                  </th>
                )}
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
                // Places gained in the round that just ran: positive is upward,
                // because a place gained is a smaller number.
                const moved = showsMovement ? (positionBefore.get(standing.carId) ?? i + 1) - (i + 1) : 0;
                return (
                  <tr
                    key={standing.carId}
                    className={`border-t border-zinc-800 ${moved !== 0 ? "bg-emerald-950/30" : "bg-zinc-900/50"}`}
                  >
                    <td className={`px-3 py-2 text-right font-mono font-bold ${PODIUM[i] ?? "text-zinc-500"}`}>
                      {i + 1}.
                    </td>
                    {showsMovement && (
                      <td
                        className={`px-2 py-2 text-right font-mono text-xs ${
                          moved > 0 ? "text-emerald-400" : moved < 0 ? "text-red-400" : "text-zinc-600"
                        }`}
                      >
                        {moved === 0 ? "·" : moved > 0 ? `▲${moved}` : `▼${-moved}`}
                      </td>
                    )}
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
