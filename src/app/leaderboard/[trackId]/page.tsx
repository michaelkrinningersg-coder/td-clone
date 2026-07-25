import { Suspense } from "react";
import { tracks } from "@/lib/data";
import { LeaderboardView } from "@/components/LeaderboardView";

export function generateStaticParams() {
  return tracks.map((track) => ({ trackId: track.id }));
}

export default async function LeaderboardPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  return (
    <Suspense fallback={<div className="px-6 py-10 text-zinc-400">Lade...</div>}>
      <LeaderboardView trackId={trackId} />
    </Suspense>
  );
}
