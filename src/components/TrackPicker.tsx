"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { tracks } from "@/lib/data";
import { buildTrackPath, outlinePath, toSvgPath } from "@/lib/track-geometry";
import { useSession } from "@/lib/selection";
import type { TrackData } from "@/lib/data";

const PADDING = 20;

/** First step of the flow: the track decides which cars are worth picking, and
 * it is what "no time yet" is measured against. */
export function TrackPicker() {
  const router = useRouter();
  const { trackId, setTrack } = useSession();

  function choose(id: string) {
    setTrack(id);
    router.push("/cars");
  }

  const sprints = tracks.filter((t) => t.type === "SPRINT");
  const circuits = tracks.filter((t) => t.type === "CIRCUIT");

  return (
    <>
      <Section title="Sprints" subtitle="Gerade Strecke — reine Beschleunigung und Höchstgeschwindigkeit">
        {sprints.map((track) => (
          <TrackTile key={track.id} track={track} current={track.id === trackId} onChoose={choose} />
        ))}
      </Section>

      <Section title="Rundstrecken" subtitle="Kurven, Steigungen und Bremspunkte fordern Handling und Balance">
        {circuits.map((track) => (
          <TrackTile key={track.id} track={track} current={track.id === trackId} onChoose={choose} />
        ))}
      </Section>
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
      <p className="text-xs text-zinc-600">{subtitle}</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function TrackTile({
  track,
  current,
  onChoose,
}: {
  track: TrackData;
  current: boolean;
  onChoose: (id: string) => void;
}) {
  const path = track.outline ? outlinePath(track.outline) : buildTrackPath(track.segments, Math.max(5, track.lengthM / 400));
  const width = path.maxX - path.minX;
  const height = path.maxY - path.minY;
  const viewBox = `${path.minX - PADDING} ${path.minY - PADDING} ${width + PADDING * 2} ${height + PADDING * 2}`;
  const corners = track.segments.filter((s) => s.kind === "corner").length;
  const climb = track.segments.some((s) => (s.gradientPercent ?? 0) > 3);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border bg-zinc-900 transition-colors ${
        current ? "border-emerald-500" : "border-zinc-800 hover:border-emerald-600"
      }`}
    >
      <button onClick={() => onChoose(track.id)} className="flex flex-1 flex-col p-4 text-left">
        <svg viewBox={viewBox} className="h-24 w-full text-emerald-500">
          <path
            d={toSvgPath(path)}
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.max(width, height) / 80}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="mt-3 text-lg font-semibold text-white">{track.name}</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          {(track.lengthM / 1000).toFixed(2)} km
          {corners > 0 && ` · ${corners} Kurven`}
          {climb && " · Steigung"}
        </div>
      </button>
      <Link
        href={`/leaderboard/${track.id}`}
        className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-white"
      >
        Rangliste ansehen →
      </Link>
    </div>
  );
}
