"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildTrackPath, pointAtDistance, toSvgPath } from "@/lib/track-geometry";
import { interpolateTraceAtTime, simulateRun, type SimResult } from "@/lib/physics";
import { timeStore } from "@/lib/time-store";
import { formatTimeMs } from "@/lib/format";
import type { CarData, TrackData } from "@/lib/data";

const PADDING = 20;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 100;

type Phase = "idle" | "running" | "finished";

interface Finish {
  timeMs: number;
  rank: number;
  totalEntries: number;
  entryId: string;
}

export function RaceRunner({ car, track }: { car: CarData; track: TrackData }) {
  const path = useMemo(
    () => buildTrackPath(track.segments, Math.max(5, track.lengthM / 600)),
    [track],
  );
  const viewBox = `${path.minX - PADDING} ${path.minY - PADDING} ${path.maxX - path.minX + PADDING * 2} ${
    path.maxY - path.minY + PADDING * 2
  }`;
  const strokeWidth = Math.max(path.maxX - path.minX, path.maxY - path.minY, 1) / 120;

  const [phase, setPhase] = useState<Phase>("idle");
  const [sim, setSim] = useState<SimResult | null>(null);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [carPos, setCarPos] = useState(() => ({ x: path.points[0].x, y: path.points[0].y, heading: 0 }));
  const [speedKph, setSpeedKph] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [timeS, setTimeS] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleStart() {
    setError(null);
    const result = simulateRun(car, track.segments);
    setSim(result);
    setPhase("running");

    const totalTimeS = result.totalTimeMs / 1000;
    // Long tracks are played back compressed so a 17-minute hillclimb stays watchable.
    const durationMs = Math.min(15000, Math.max(4000, result.totalTimeMs / 50));
    // The first frame's timestamp is the clock - no need to sample a separate one.
    let start: number | null = null;

    function frame(now: number) {
      start ??= now;
      const p = Math.min(1, (now - start) / durationMs);
      const tp = interpolateTraceAtTime(result.trace, p * totalTimeS);
      setCarPos(pointAtDistance(path, tp.distanceM));
      setSpeedKph(tp.speedKph);
      setDistanceM(tp.distanceM);
      setTimeS(p * totalTimeS);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        void persist(result);
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  async function persist(result: SimResult) {
    try {
      const saved = await timeStore.saveRun(car.id, track.id, result.totalTimeMs);
      setFinish({
        timeMs: result.totalTimeMs,
        rank: saved.rank,
        totalEntries: saved.totalEntries,
        entryId: saved.entry.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeit konnte nicht gespeichert werden.");
      setFinish({ timeMs: result.totalTimeMs, rank: 0, totalEntries: 0, entryId: "" });
    } finally {
      setPhase("finished");
    }
  }

  const maxTraceSpeed = sim ? Math.max(1, ...sim.trace.map((p) => p.speedKph)) : 1;
  const chartPoints = sim
    ? sim.trace
        .map((p) => {
          const x = (p.distanceM / track.lengthM) * CHART_WIDTH;
          const y = CHART_HEIGHT - (p.speedKph / maxTraceSpeed) * CHART_HEIGHT;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";
  const progressX = (distanceM / track.lengthM) * CHART_WIDTH;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <svg viewBox={viewBox} className="h-72 w-full text-zinc-700">
          <path
            d={toSvgPath(path)}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={carPos.x} cy={carPos.y} r={strokeWidth * 3} className="fill-emerald-400" />
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-8 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Tempo</div>
          <div className="font-mono text-3xl font-bold text-white">{speedKph.toFixed(0)} km/h</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Zeit</div>
          <div className="font-mono text-3xl font-bold text-white">{formatTimeMs(timeS * 1000)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Distanz</div>
          <div className="font-mono text-3xl font-bold text-white">
            {(distanceM / 1000).toFixed(2)} / {(track.lengthM / 1000).toFixed(2)} km
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Geschwindigkeit über die Strecke</div>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-24 w-full">
          {sim && <polyline points={chartPoints} fill="none" stroke="#34d399" strokeWidth={2} />}
          {phase === "running" && (
            <line x1={progressX} x2={progressX} y1={0} y2={CHART_HEIGHT} stroke="#f59e0b" strokeWidth={2} />
          )}
        </svg>
      </div>

      {phase === "idle" && (
        <button
          onClick={handleStart}
          className="self-start rounded-full bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Fahrt starten
        </button>
      )}

      {phase === "finished" && finish && (
        <div className="rounded-xl border border-emerald-700 bg-emerald-950/40 p-6">
          <div className="text-sm text-zinc-400">Ziel erreicht!</div>
          <div className="mt-1 font-mono text-4xl font-bold text-white">{formatTimeMs(finish.timeMs)}</div>
          {error ? (
            <div className="mt-2 text-amber-400">{error}</div>
          ) : (
            <div className="mt-2 text-zinc-300">
              Platz <span className="font-semibold text-white">{finish.rank}</span> von{" "}
              <span className="font-semibold text-white">{finish.totalEntries}</span> auf {track.name}
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <Link
              href={`/leaderboard/${track.id}?highlight=${finish.entryId}`}
              className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Rangliste ansehen
            </Link>
            <Link
              href="/"
              className="rounded-full border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 hover:border-zinc-500"
            >
              Neues Auto
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
