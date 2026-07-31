"use client";

import { useEffect, useState } from "react";
import { simulateTrack, type SimResult } from "@/lib/physics";
import type { CarData, TrackData } from "@/lib/data";
import type { SimRequest, SimResponse } from "@/lib/sim.worker";

export interface SimulatedCar {
  car: CarData;
  sim: SimResult;
}

export interface FieldSimulation {
  /** Null until every car is in. Partial results are not handed out: a board
   * built from half a grid would rank cars against a field that does not exist
   * yet, and the numbers would jump as the rest arrived. */
  sims: SimulatedCar[] | null;
  /** How many of them are done, so the page can say so. */
  done: number;
  total: number;
  error: string | null;
}

/** Simulates a whole grid, off the main thread where the browser allows it.
 *
 * A lap costs about twenty milliseconds and a championship round is a hundred
 * cars, so run inline it locks the page up for two seconds each time. A worker
 * keeps the page answering and lets it show how far along it is.
 *
 * Falls back to running inline when there is no Worker to be had - a browser
 * without one, or the prerender, where there is no window at all. The result is
 * identical either way: the same function, the same numbers, only somewhere
 * else. */
export function useSimulatedField(cars: CarData[], track: TrackData): FieldSimulation {
  /** The result carries the inputs it belongs to. Asked about a different grid,
   * the hook reports "not ready" by comparing rather than by resetting - a
   * state update in the body of an effect only to clear what is already stale
   * is a render nobody needed. */
  const [state, setState] = useState<(FieldSimulation & { cars: CarData[]; track: TrackData }) | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const settle = (result: FieldSimulation) => {
      if (!cancelled) setState({ ...result, cars, track });
    };

    if (cars.length === 0) {
      queueMicrotask(() => settle({ sims: [], done: 0, total: 0, error: null }));
      return;
    }

    /** Same function, same numbers, only on this thread. Deferred a tick so the
     * "simulating" line gets a chance to paint before the page locks up. */
    const inline = () =>
      queueMicrotask(() => {
        if (cancelled) return;
        const sims = cars.map((car) => ({ car, sim: simulateTrack(car, track) }));
        settle({ sims, done: sims.length, total: sims.length, error: null });
      });

    if (typeof Worker === "undefined") {
      inline();
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("./sim.worker.ts", import.meta.url));
    } catch {
      inline();
      return;
    }

    const byId = new Map<string, SimResult>();
    worker.addEventListener("message", (event: MessageEvent<SimResponse>) => {
      if (cancelled) return;
      const message = event.data;
      if (message.kind === "progress") {
        byId.set(message.carId, message.sim);
        setState((s) =>
          s && s.cars === cars && s.track === track ? { ...s, done: byId.size } : s,
        );
        return;
      }
      worker.terminate();
      if (message.kind === "error") {
        settle({ sims: null, done: byId.size, total: cars.length, error: message.message });
        return;
      }
      const sims = cars
        .map((car) => {
          const sim = byId.get(car.id);
          return sim ? { car, sim } : null;
        })
        .filter((entry): entry is SimulatedCar => entry !== null);
      settle({ sims, done: sims.length, total: cars.length, error: null });
    });
    // A worker that cannot start at all - a stale bundle, a blocked URL - must
    // not leave the page waiting forever with nothing to show.
    worker.addEventListener("error", () => {
      worker.terminate();
      inline();
    });

    const request: SimRequest = { cars, track };
    worker.postMessage(request);
    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [cars, track]);

  if (state && state.cars === cars && state.track === track) return state;
  return { sims: null, done: 0, total: cars.length, error: null };
}
