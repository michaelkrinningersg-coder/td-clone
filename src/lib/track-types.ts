/** Which way a corner turns. A real property of a circuit, so it is part of the
 * track data rather than something the renderer guesses - it is what makes each
 * layout recognizable instead of a generic zigzag. It has no effect on lap
 * times; only on how the track is drawn. */
export type TurnDirection = "left" | "right";

export type Segment =
  | { kind: "straight"; lengthM: number; gradientPercent?: number }
  | {
      kind: "corner";
      lengthM: number;
      radiusM: number;
      dir: TurnDirection;
      gradientPercent?: number;
    };

/** A test against the speedometer rather than against a distance.
 *
 * "0-100-0" and a rolling 50-100 are not laps: nobody cares how far the car
 * went, only how long it took to get to a speed (and, for the standing test,
 * back to a standstill). The distance falls out of the run instead of being
 * given, which is why these carry a speed pair rather than a segment list. */
export interface SpeedTest {
  /** Speed the run starts from, km/h. Zero for a standing start. */
  fromKph: number;
  /** Speed that has to be reached, km/h. */
  toKph: number;
  /** Whether the clock keeps running until the car is back at a standstill. */
  brakeToStop: boolean;
  /** What a car that cannot get there is given, in seconds. A car whose top
   * speed is below the target would otherwise never produce a time at all. */
  timeoutS: number;
}

export interface TrackDefinition {
  name: string;
  type: "SPRINT" | "CIRCUIT";
  segments: Segment[];
  /** Set when the track is a speed test; the segments then only say how long
   * the drawn line is. */
  speedTest?: SpeedTest;
  /** The circuit's surveyed centreline, in metres. Present for the real
   * circuits, where the map should be the measured shape rather than the
   * segment list drawn back out. A sprint and a hillclimb have none. */
  outline?: [number, number][];
}

export function trackLengthM(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.lengthM, 0);
}

export function parseSegments(segmentsJson: string): Segment[] {
  return JSON.parse(segmentsJson) as Segment[];
}
