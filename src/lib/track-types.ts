export type Segment =
  | { kind: "straight"; lengthM: number; gradientPercent?: number }
  | { kind: "corner"; lengthM: number; radiusM: number; gradientPercent?: number };

export interface TrackDefinition {
  name: string;
  type: "SPRINT" | "CIRCUIT";
  segments: Segment[];
}

export function trackLengthM(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.lengthM, 0);
}

export function parseSegments(segmentsJson: string): Segment[] {
  return JSON.parse(segmentsJson) as Segment[];
}
