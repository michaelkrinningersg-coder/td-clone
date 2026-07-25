"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getCar, getTrack } from "@/lib/data";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import { formatTimeMs } from "@/lib/format";

export function LeaderboardView({ trackId }: { trackId: string }) {
  const highlight = useSearchParams().get("highlight");
  const track = getTrack(trackId);
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    timeStore
      .getLeaderboard(trackId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  if (!track) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-zinc-400">Strecke nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <p className="text-sm text-zinc-400">Rangliste</p>
      <h1 className="mt-1 text-2xl font-bold text-white">{track.name}</h1>

      {entries === null ? (
        <p className="mt-8 text-zinc-400">Lade Zeiten...</p>
      ) : entries.length === 0 ? (
        <p className="mt-8 text-zinc-400">Noch keine Zeiten auf dieser Strecke gefahren.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3">Platz</th>
              <th className="py-2 pr-3">Auto</th>
              <th className="py-2 pr-3">Zeit</th>
              <th className="py-2 pr-3">Datum</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const car = getCar(entry.carId);
              return (
                <tr
                  key={entry.id}
                  className={`border-b border-zinc-900 ${entry.id === highlight ? "bg-emerald-950/50" : ""}`}
                >
                  <td className="py-2 pr-3 font-mono text-zinc-400">{i + 1}</td>
                  <td className="py-2 pr-3 text-white">
                    {car ? `${car.make} ${car.model} (${car.year})` : entry.carId}
                  </td>
                  <td className="py-2 pr-3 font-mono text-white">{formatTimeMs(entry.timeMs)}</td>
                  <td className="py-2 pr-3 text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString("de-DE")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Link href="/" className="mt-8 inline-block text-emerald-400 hover:text-emerald-300">
        ← Neues Auto/Strecke waehlen
      </Link>
    </div>
  );
}
