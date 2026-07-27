"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CarResult, ChampionshipState } from "@/lib/championship";
import { newChampionship, recordRound } from "@/lib/championship";

/** The running championship, kept in localStorage so a series survives a reload
 * halfway through. Same shape as the session store: an external store read
 * through useSyncExternalStore rather than state copied in by an effect. */

const STORAGE_KEY = "td-clone:championship";

interface Snapshot {
  state: ChampionshipState | null;
  /** False until localStorage has been read, so the prerendered markup and the
   * first client render agree before a stored series appears. */
  ready: boolean;
}

const EMPTY: Snapshot = { state: null, ready: false };

// One cached object, replaced whole on every change: useSyncExternalStore
// compares snapshots by identity, so it must not be rebuilt on each read.
let snapshot: Snapshot = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist(next: ChampionshipState | null) {
  snapshot = { state: next, ready: true };
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or a full quota: the series still runs for this visit.
  }
  emit();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  let restored: ChampionshipState | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChampionshipState) : null;
    if (parsed && Array.isArray(parsed.carIds) && Array.isArray(parsed.trackIds)) {
      restored = {
        carIds: parsed.carIds,
        trackIds: parsed.trackIds,
        // A championship stored while the field still ran in heats keeps its
        // completed rounds; a half-finished round simply starts over.
        rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
      };
    }
  } catch {
    // A corrupt entry just means no championship is running.
  }
  snapshot = { state: restored, ready: true };
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

export function useChampionship() {
  const { state, ready } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const start = useCallback((carIds: string[], trackIds: string[]) => {
    persist(newChampionship(carIds, trackIds));
  }, []);

  const finishRound = useCallback((results: CarResult[]) => {
    if (snapshot.state) persist(recordRound(snapshot.state, results));
  }, []);

  const abandon = useCallback(() => persist(null), []);

  return { state, ready, start, finishRound, abandon };
}
