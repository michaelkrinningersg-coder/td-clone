/// <reference lib="webworker" />
import { simulateTrack, type SimResult } from "@/lib/physics";
import type { CarData, TrackData } from "@/lib/data";

/** Simulating a grid off the main thread.
 *
 * One lap costs about twenty milliseconds, most of it solving the launch grip
 * against the car's real 0-100 time - sixty bisection steps, each a full run to
 * a hundred. A championship round is a hundred cars, so doing it where the page
 * lives freezes it for two seconds every time the flag drops.
 *
 * Results come back one at a time rather than in a batch, so the page can say
 * how far along it is instead of just going quiet. */
export interface SimRequest {
  cars: CarData[];
  track: TrackData;
}

export type SimResponse =
  | { kind: "progress"; index: number; total: number; carId: string; sim: SimResult }
  | { kind: "done" }
  | { kind: "error"; message: string };

const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<SimRequest>) => {
  const { cars, track } = event.data;
  try {
    cars.forEach((car, index) => {
      const sim = simulateTrack(car, track);
      worker.postMessage({ kind: "progress", index, total: cars.length, carId: car.id, sim });
    });
    worker.postMessage({ kind: "done" });
  } catch (err) {
    worker.postMessage({
      kind: "error",
      message: err instanceof Error ? err.message : "Simulation fehlgeschlagen",
    });
  }
});
