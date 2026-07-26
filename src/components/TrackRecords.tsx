"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCar, tracks } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { formatTimeMs } from "@/lib/format";
import { timeStore, type TimeEntryData } from "@/lib/time-store";

interface Record {
  trackId: string;
  best: TimeEntryData | null;
  entries: number;
}

/** Every track with its record holder, in one place. The per-track boards
 * answer "who is quickest here"; this answers "where have I actually been". */
export function TrackRecords() {
  const [records, setRecords] = useState<Record[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      tracks.map(async (track) => {
        const entries = await timeStore.getLeaderboard(track.id);
        return { trackId: track.id, best: entries[0] ?? null, entries: entries.length };
      }),
    )
      .then((result) => {
        if (!cancelled) setRecords(result);
      })
      .catch(() => {
        if (!cancelled) setRecords(tracks.map((t) => ({ trackId: t.id, best: null, entries: 0 })));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const driven = records?.filter((r) => r.best !== null).length ?? 0;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-white">Streckenrekorde</h2>
      <p className="mt-1 text-sm text-zinc-400">
        {records === null
          ? "Lade Zeiten..."
          : `${driven} von ${tracks.length} Strecken haben eine Bestzeit.`}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Strecke</th>
              <th className="px-3 py-2 text-right font-medium">Länge</th>
              <th className="px-3 py-2 text-left font-medium">Rekordhalter</th>
              <th className="px-3 py-2 text-right font-medium">Zeiten</th>
              <th className="px-3 py-2 text-right font-medium">Bestzeit</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const record = records?.find((r) => r.trackId === track.id);
              const car = record?.best ? getCar(record.best.carId) : undefined;
              return (
                <tr key={track.id} className="border-t border-zinc-800 bg-zinc-900/50">
                  <td className="px-3 py-2">
                    <Link href={`/leaderboard/${track.id}`} className="text-white hover:text-emerald-400">
                      {track.name}
                    </Link>
                    <span className="block text-xs text-zinc-600">
                      {track.type === "SPRINT" ? "Sprint" : "Rundstrecke"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    {(track.lengthM / 1000).toFixed(2)} km
                  </td>
                  <td className="px-3 py-2">
                    {car ? (
                      <>
                        <span
                          className="text-xs font-medium uppercase tracking-wide"
                          style={{ color: brandColor(car.make) }}
                        >
                          {car.make}
                        </span>{" "}
                        <span className="text-zinc-300">{car.model}</span>{" "}
                        <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                      </>
                    ) : (
                      <span className="text-zinc-600">noch niemand</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-500">{record?.entries ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                    {record?.best ? formatTimeMs(record.best.timeMs) : <span className="text-zinc-700">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
