"use client";

import { useSearchParams } from "next/navigation";
import { getTrack } from "@/lib/data";
import { TrackLeaderboard } from "@/components/TrackLeaderboard";

export function LeaderboardView({ trackId }: { trackId: string }) {
  const highlight = useSearchParams().get("highlight") ?? undefined;
  const track = getTrack(trackId);

  if (!track) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="text-zinc-400">Strecke nicht gefunden.</p>
      </div>
    );
  }

  return <TrackLeaderboard track={track} highlight={highlight} />;
}
