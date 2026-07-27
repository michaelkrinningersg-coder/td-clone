"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** How long a finished round stays on screen before the next one starts. Long
 * enough to read the winner, short enough not to be a wait. */
const AUTO_ADVANCE_MS = 3000;

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
  // A season is fifteen rounds; clicking through every one of them is not the
  // game. Left on, a finished round is scored and the next one started on its
  // own, with just enough of a pause to read who won.
  const [autoAdvance, setAutoAdvance] = useState(true);

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

  function confirmRound(scrollToTrack = true) {
    if (!finishedRound) return;
    setFinishedRound(null);
    onRoundFinished(finishedRound);
    // The next round starts on its own, so bring the map back into view - the
    // button can be pressed from anywhere on the page. On an automatic
    // advance the page is left where the reader put it.
    if (scrollToTrack) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Held in a ref so the timer below does not restart on every render.
  const confirmRef = useRef(confirmRound);
  useEffect(() => {
    confirmRef.current = confirmRound;
  });
  useEffect(() => {
    if (!autoAdvance || !finishedRound) return;
    const timer = setTimeout(() => confirmRef.current(false), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [autoAdvance, finishedRound]);

  // Who won the round that has just come home, for the header.
  const roundWinner = finishedRound
    ? getCar([...finishedRound].sort((a, b) => a.timeMs - b.timeMs)[0]?.carId ?? "")
    : undefined;
  const roundWinnerTimeMs = finishedRound
    ? Math.min(...finishedRound.map((r) => r.timeMs))
    : 0;

  return (
    <div className="mt-6 flex flex-col gap-8">
      {!done && track && (
        // The round header is 4.75rem tall and fixed, so the board in the
        // runner has to stick below it rather than behind it.
        <section style={{ "--board-top": "5.5rem" } as React.CSSProperties}>
          {/* One header for the round, always there and always the same height:
              which round it is on the left, and once the field is home the
              result and the way on on the right. Filling it as the round ends
              rather than adding a bar keeps everything below it exactly where
              it was. */}
          <header className="sticky top-0 z-30 -mx-6 flex h-[4.75rem] items-center gap-4 border-b border-zinc-800 bg-zinc-950/95 px-6 backdrop-blur">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-white">
                Lauf {roundNumber} von {lastRound}: {track.name}
              </h2>
              <p className="truncate text-xs text-zinc-400">
                {gridCars.length} Autos gemeinsam am Start
                {state.rounds.length > 0 && " · aufgestellt nach dem Meisterschaftsstand"}
                {finishedRound &&
                  (autoAdvance
                    ? " · gewertet, nächster Lauf startet gleich"
                    : " · Stand vorläufig gewertet")}
              </p>
            </div>

            <label
              className="ml-auto hidden shrink-0 items-center gap-2 text-xs text-zinc-400 md:flex"
              title="Jeden Lauf werten und den nächsten sofort starten, bis die Meisterschaft entschieden ist."
            >
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-500"
              />
              Läufe automatisch
            </label>

            {finishedRound && (
              <div className="flex shrink-0 items-center gap-4">
                <div className="hidden min-w-0 text-right md:block">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">Zieleinlauf</div>
                  <div className="truncate font-semibold text-white">
                    {roundWinner ? `${roundWinner.make} ${roundWinner.model}` : "—"}
                  </div>
                </div>
                <div className="font-mono text-xl text-emerald-400">{formatTimeMs(roundWinnerTimeMs)}</div>
                {/* The table is a long way down past thirty cars, so the header
                    carries the way there as well as the way on. */}
                <a
                  href="#meisterschaftsstand"
                  className="hidden rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white sm:block"
                >
                  Zum Stand ↓
                </a>
                <button
                  type="button"
                  onClick={() => confirmRound()}
                  className="whitespace-nowrap rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  {roundNumber < lastRound ? "Lauf werten und weiter" : "Meisterschaft abschließen"}
                </button>
              </div>
            )}
          </header>

          {/* No list of the field here - "Dieses Rennen" names every car in
              its grid colour and keeps doing so while they run. Keyed so every
              round starts a fresh runner rather than replaying the previous
              one's state. The result lives in the header, so the runner does
              not show its own. */}
          <RaceRunner
            key={state.rounds.length}
            cars={gridCars}
            track={track}
            onFinish={setFinishedRound}
            showResult={false}
            // The first round waits to be started; every one after it follows
            // straight on from "Lauf werten und weiter".
            autoStart={state.rounds.length > 0}
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

      <section id="meisterschaftsstand" className="scroll-mt-28">
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
