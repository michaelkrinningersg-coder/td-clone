"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { DuelRoundResult } from "@/lib/duel";

/** A running duel, kept in localStorage like the championship. */

const STORAGE_KEY = "td-clone:duel";

export interface DuelState {
  makes: [string, string];
  /** Car ids per marque, in the order they were fielded. */
  teams: [string[], string[]];
  trackIds: string[];
  rounds: DuelRoundResult[];
}

interface Snapshot {
  state: DuelState | null;
  ready: boolean;
}

const EMPTY: Snapshot = { state: null, ready: false };

let snapshot: Snapshot = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function persist(next: DuelState | null) {
  snapshot = { state: next, ready: true };
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or a full quota: the duel still runs for this visit.
  }
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  let restored: DuelState | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DuelState) : null;
    if (parsed && Array.isArray(parsed.makes) && Array.isArray(parsed.teams)) {
      restored = {
        makes: parsed.makes,
        teams: parsed.teams,
        trackIds: Array.isArray(parsed.trackIds) ? parsed.trackIds : [],
        rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
      };
    }
  } catch {
    // A corrupt entry just means no duel is running.
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

export function useDuel() {
  const { state, ready } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const start = useCallback((next: DuelState) => persist(next), []);

  const finishRound = useCallback((round: DuelRoundResult) => {
    if (snapshot.state) persist({ ...snapshot.state, rounds: [...snapshot.state.rounds, round] });
  }, []);

  const abandon = useCallback(() => persist(null), []);

  return { state, ready, start, finishRound, abandon };
}
