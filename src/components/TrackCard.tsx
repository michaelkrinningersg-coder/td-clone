import Link from "next/link";
import { buildTrackPath, outlinePath, toSvgPath } from "@/lib/track-geometry";
import type { TrackData } from "@/lib/data";

const PADDING = 20;

export function TrackCard({ track, href }: { track: TrackData; href: string }) {
  const path = track.outline ? outlinePath(track.outline) : buildTrackPath(track.segments, Math.max(5, track.lengthM / 400));
  const width = path.maxX - path.minX;
  const height = path.maxY - path.minY;
  const viewBox = `${path.minX - PADDING} ${path.minY - PADDING} ${width + PADDING * 2} ${height + PADDING * 2}`;

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-600"
    >
      <svg viewBox={viewBox} className="h-28 w-full text-emerald-500">
        <path d={toSvgPath(path)} fill="none" stroke="currentColor" strokeWidth={Math.max(width, height) / 80} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {track.type === "SPRINT" ? "Sprint" : "Rundstrecke"}
        </div>
        <div className="text-lg font-semibold text-white">{track.name}</div>
        <div className="text-xs text-zinc-500">{(track.lengthM / 1000).toFixed(2)} km</div>
      </div>
    </Link>
  );
}
