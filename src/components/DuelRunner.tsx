"use client";

import { useMemo, useState } from "react";
import { getCar, getTrack } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatTimeMs } from "@/lib/format";
import { duelLeader, duelScores, type DuelRoundResult } from "@/lib/duel";
import type { DuelState } from "@/lib/use-duel";
import { RaceRunner } from "@/components/RaceRunner";

/** A duel in progress: both teams on track together, then the tally.
 *
 * Ten cars run at once rather than five and five - the whole point is seeing
 * one marque's cars among the other's, which two separate races cannot show. */
export function DuelRunner({
  state,
  onRoundFinished,
}: {
  state: DuelState;
  onRoundFinished: (round: DuelRoundResult) => void;
}) {
  const [finished, setFinished] = useState<DuelRoundResult | null>(null);

  const scores = useMemo(() => duelScores(state.makes, state.rounds), [state]);
  const leader = duelLeader(scores);
  const roundIndex = state.rounds.length;
  const trackId = state.trackIds[roundIndex];
  const track = trackId ? getTrack(trackId) : undefined;
  const done = roundIndex >= state.trackIds.length;

  // Alternating so the two marques interleave in the grid order, which keeps
  // the colours from lining up as five of one then five of the other.
  const grid = useMemo(() => {
    const [a, b] = state.teams;
    const out: { carId: string; make: string }[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) out.push({ carId: a[i], make: state.makes[0] });
      if (b[i]) out.push({ carId: b[i], make: state.makes[1] });
    }
    return out;
  }, [state]);

  const gridCars = grid.map((g) => getCar(g.carId)).filter((c) => c !== undefined);
  const makeOf = new Map(grid.map((g) => [g.carId, g.make]));

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-2">
        {scores.map((score) => (
          <div
            key={score.make}
            className={`rounded-xl border p-4 ${
              leader?.make === score.make ? "border-emerald-600 bg-emerald-950/30" : "border-zinc-800 bg-zinc-900"
            }`}
          >
            <div className="text-sm font-medium uppercase tracking-wide" style={{ color: brandColor(score.make) }}>
              {score.make}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-white">{score.roundsWon}</span>
              <span className="text-sm text-zinc-500">
                {score.roundsWon === 1 ? "Runde" : "Runden"} von {state.trackIds.length}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {score.duelsWon} Direktvergleiche gewonnen
              {score.bestTimeMs !== null && ` · beste Zeit ${formatTimeMs(score.bestTimeMs)}`}
            </div>
          </div>
        ))}
      </section>

      {!done && track && (
        <section>
          <h2 className="text-lg font-bold text-white">
            Runde {roundIndex + 1} von {state.trackIds.length}: {track.name}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {gridCars.length} Autos gemeinsam auf der Strecke. Gewertet wird die Summe je Marke.
          </p>

          <RaceRunner
            key={roundIndex}
            cars={gridCars}
            track={track}
            onFinish={(results) =>
              setFinished({
                trackId: track.id,
                results: results.map((r) => ({
                  carId: r.carId,
                  make: makeOf.get(r.carId) ?? "",
                  timeMs: r.timeMs,
                })),
              })
            }
            outro={
              <button
                type="button"
                onClick={() => {
                  if (!finished) return;
                  setFinished(null);
                  onRoundFinished(finished);
                }}
                className="mt-4 rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                {roundIndex + 1 < state.trackIds.length ? "Runde werten und weiter" : "Duell entscheiden"}
              </button>
            }
          />
        </section>
      )}

      {done && (
        <section className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-5">
          <div className="text-sm text-zinc-400">Duell entschieden</div>
          <div className="mt-1 text-3xl font-bold" style={{ color: leader ? brandColor(leader.make) : "#fff" }}>
            {leader ? leader.make : "Unentschieden"}
          </div>
          {leader && (
            <div className="mt-1 text-sm text-zinc-400">
              {leader.roundsWon} von {state.trackIds.length} Runden · {leader.duelsWon} Direktvergleiche
            </div>
          )}
        </section>
      )}

      {state.rounds.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-white">Runden</h2>
          <div className="mt-3 flex flex-col gap-3">
            {state.rounds.map((round, i) => {
              const roundTrack = getTrack(round.trackId);
              const totals = state.makes.map((make) => ({
                make,
                total: round.results.filter((r) => r.make === make).reduce((sum, r) => sum + r.timeMs, 0),
              }));
              const winner = totals.reduce((best, t) => (t.total < best.total ? t : best));
              const ranked = [...round.results].sort((a, b) => a.timeMs - b.timeMs);
              return (
                <div key={i} className="overflow-hidden rounded-xl border border-zinc-800">
                  <div className="flex flex-wrap items-baseline gap-3 bg-zinc-900 px-4 py-2">
                    <span className="font-semibold text-white">{roundTrack?.name ?? round.trackId}</span>
                    {totals.map((t) => (
                      <span key={t.make} className="font-mono text-xs">
                        <span style={{ color: brandColor(t.make) }}>{t.make}</span>{" "}
                        <span className={t.make === winner.make ? "text-emerald-400" : "text-zinc-500"}>
                          {formatTimeMs(t.total)}
                        </span>
                      </span>
                    ))}
                  </div>
                  <ol className="flex flex-col gap-px bg-zinc-800">
                    {ranked.map((result, position) => {
                      const car = getCar(result.carId);
                      return (
                        <li
                          key={result.carId}
                          className="flex items-center gap-3 bg-zinc-900/60 px-4 py-1.5 text-sm"
                        >
                          <span className="w-6 shrink-0 text-right font-mono text-zinc-500">
                            {position + 1}.
                          </span>
                          <span
                            className="w-28 shrink-0 truncate text-xs font-medium uppercase tracking-wide"
                            style={{ color: brandColor(result.make) }}
                          >
                            {result.make}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-zinc-300">
                            {car ? `${car.model} ’${String(car.year).slice(2)}` : result.carId}
                          </span>
                          <span className="shrink-0 font-mono text-white">{formatTimeMs(result.timeMs)}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
