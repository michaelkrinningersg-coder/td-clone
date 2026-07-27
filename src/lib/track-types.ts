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

export interface TrackDefinition {
  name: string;
  type: "SPRINT" | "CIRCUIT";
  segments: Segment[];
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
