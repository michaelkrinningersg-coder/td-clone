"use client";

import { useCallback, useEffect, useState } from "react";
import { timeStore, type TimeEntryData } from "@/lib/time-store";

export interface TrackTimes {
  /** Null while the times for the current track are still being read. */
  entries: TimeEntryData[] | null;
  /** Undefined while loading, so a filter can tell "not known yet" from "none". */
  timedCarIds: ReadonlySet<string> | undefined;
  /** Re-reads the store, e.g. after a race has recorded new times. */
  reload: () => void;
}

export function useTrackTimes(trackId: string | null | undefined): TrackTimes {
  // Keyed by the track it belongs to, so switching tracks reads as "loading"
  // without needing to reset state from inside the effect.
  const [loaded, setLoaded] = useState<{ trackId: string; entries: TimeEntryData[] } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    timeStore
      .getLeaderboard(trackId)
      .then((entries) => {
        if (!cancelled) setLoaded({ trackId, entries });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ trackId, entries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, nonce]);

  const entries = !trackId ? [] : loaded?.trackId === trackId ? loaded.entries : null;
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    entries,
    timedCarIds: entries ? new Set(entries.map((e) => e.carId)) : undefined,
    reload,
  };
}
