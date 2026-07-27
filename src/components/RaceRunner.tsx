"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildTrackPath, outlinePath, pointAtDistance, toSvgPath } from "@/lib/track-geometry";
import { interpolateTraceAtTime, simulateRun, type SimResult } from "@/lib/physics";
import { playbackDurationMs, raceHex, rankRacers, type RacerProgress } from "@/lib/race";
import { timeStore } from "@/lib/time-store";
import { formatTimeMs } from "@/lib/format";
import { LiveRanking } from "@/components/LiveRanking";
import { SectorTimes } from "@/components/SectorTimes";
import type { CarData, TrackData } from "@/lib/data";

const PADDING = 20;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 110;

type Phase = "idle" | "running" | "finished";

export function RaceRunner({
  cars,
  track,
  saveTimes = true,
  onFinish,
  outro,
}: {
  cars: CarData[];
  track: TrackData;
  /** Off for a run that should not touch the leaderboard. */
  saveTimes?: boolean;
  /** Called once with every car's time when the replay has run out. */
  onFinish?: (results: { carId: string; timeMs: number }[]) => void;
  /** Replaces the links under the result, e.g. with "next heat". */
  outro?: React.ReactNode;
}) {
  const path = useMemo(
    () => (track.outline ? outlinePath(track.outline) : buildTrackPath(track.segments, Math.max(5, track.lengthM / 600))),
    [track],
  );
  const viewBox = `${path.minX - PADDING} ${path.minY - PADDING} ${path.maxX - path.minX + PADDING * 2} ${
    path.maxY - path.minY + PADDING * 2
  }`;
  const strokeWidth = Math.max(path.maxX - path.minX, path.maxY - path.minY, 1) / 120;

  /** Every car is simulated up front; the animation is only a replay of results
   * that already exist, which is what lets the ranking know each final time. */
  const sims = useMemo<{ car: CarData; sim: SimResult }[]>(
    () => cars.map((car) => ({ car, sim: simulateRun(car, track.segments) })),
    [cars, track],
  );
  const slowestMs = Math.max(...sims.map((s) => s.sim.totalTimeMs));

  const [phase, setPhase] = useState<Phase>("idle");
  const [simTimeS, setSimTimeS] = useState(0);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // All cars share one clock, so a faster car visibly pulls away and crosses
  // the line first instead of every car finishing together.
  const progress: RacerProgress[] = sims.map(({ car, sim }, i) => {
    const carTimeS = sim.totalTimeMs / 1000;
    const finished = simTimeS >= carTimeS;
    const tp = interpolateTraceAtTime(sim.trace, Math.min(simTimeS, carTimeS));
    return {
      carId: car.id,
      gridIndex: i,
      distanceM: tp.distanceM,
      speedKph: finished ? 0 : tp.speedKph,
      totalTimeMs: sim.totalTimeMs,
      // The car's own clock: ticking while it drives, stopped at its lap time
      // the moment it crosses the line.
      elapsedMs: finished ? sim.totalTimeMs : simTimeS * 1000,
      finished,
    };
  });
  const ranked = rankRacers(progress);

  function handleStart() {
    setError(null);
    setPhase("running");
    const durationMs = playbackDurationMs(slowestMs);
    let start: number | null = null;

    function frame(now: number) {
      start ??= now;
      const p = Math.min(1, (now - start) / durationMs);
      setSimTimeS((p * slowestMs) / 1000);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        void persist();
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  async function persist() {
    try {
      if (saveTimes) {
        for (const { car, sim } of sims) {
          await timeStore.saveRun(car.id, track.id, sim.totalTimeMs);
        }
        setSavedAt(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeiten konnten nicht gespeichert werden.");
    } finally {
      setPhase("finished");
      onFinish?.(sims.map(({ car, sim }) => ({ carId: car.id, timeMs: sim.totalTimeMs })));
    }
  }

  const maxTraceSpeed = Math.max(1, ...sims.flatMap(({ sim }) => sim.trace.map((p) => p.speedKph)));

  return (
    <div className="mt-6 flex flex-col gap-4">
      {phase === "idle" && (
        <button
          onClick={handleStart}
          className="self-start rounded-full bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Rennen starten
        </button>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <svg viewBox={viewBox} className="h-80 w-full text-zinc-700">
          <path
            d={toSvgPath(path)}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {progress.map((racer) => {
            const pos = pointAtDistance(path, racer.distanceM);
            return (
              <circle
                key={racer.carId}
                cx={pos.x}
                cy={pos.y}
                r={strokeWidth * 3}
                fill={raceHex(racer.gridIndex, cars.length)}
                stroke="#09090b"
                strokeWidth={strokeWidth * 0.6}
              />
            );
          })}
        </svg>
      </div>

      {/* Directly under the simulation, so the order on screen matches the
          order on track. */}
      <LiveRanking ranked={ranked} cars={cars} track={track} savedAt={savedAt} />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
          <span>Geschwindigkeit über die Strecke</span>
          <span className="font-mono text-zinc-400">{formatTimeMs(simTimeS * 1000)}</span>
        </div>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-28 w-full">
          {sims.map(({ car, sim }, i) => (
            <polyline
              key={car.id}
              points={sim.trace
                .map(
                  (p) =>
                    `${((p.distanceM / track.lengthM) * CHART_WIDTH).toFixed(1)},${(
                      CHART_HEIGHT -
                      (p.speedKph / maxTraceSpeed) * CHART_HEIGHT
                    ).toFixed(1)}`,
                )
                .join(" ")}
              fill="none"
              stroke={raceHex(i, cars.length)}
              strokeWidth={1.5}
              opacity={0.9}
            />
          ))}
          {phase !== "idle" &&
            ranked.map((racer) => {
              const x = (racer.distanceM / track.lengthM) * CHART_WIDTH;
              return (
                <line
                  key={racer.carId}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={CHART_HEIGHT}
                  stroke={raceHex(racer.gridIndex, cars.length)}
                  strokeWidth={1}
                  opacity={0.35}
                />
              );
            })}
        </svg>
      </div>

      {phase === "finished" && <SectorTimes runs={sims} />}

      {phase === "finished" && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-5">
          <div className="text-sm text-zinc-400">Zieleinlauf</div>
          <div className="mt-1 text-xl font-bold text-white">
            {(() => {
              const winner = cars.find((c) => c.id === ranked[0]?.carId);
              return winner ? `${winner.make} ${winner.model}` : "—";
            })()}
          </div>
          <div className="font-mono text-2xl text-emerald-400">{formatTimeMs(ranked[0]?.totalTimeMs ?? 0)}</div>
          {error && <p className="mt-2 text-amber-400">{error}</p>}
          {outro ?? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/leaderboard/${track.id}`}
              className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Rangliste
            </Link>
            <Link
              href="/"
              className="rounded-full border border-zinc-700 px-5 py-2 font-semibold text-zinc-300 hover:border-zinc-500"
            >
              Andere Strecke
            </Link>
            <Link
              href="/cars"
              className="rounded-full border border-zinc-700 px-5 py-2 font-semibold text-zinc-300 hover:border-zinc-500"
            >
              Autos ändern
            </Link>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
