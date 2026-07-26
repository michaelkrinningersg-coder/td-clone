"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAX_RACERS } from "@/lib/race";

/** The picked cars have to survive navigating between brands, so the selection
 * lives outside React in a small store mirrored to localStorage. Order matters:
 * it decides which racing colour each car gets.
 *
 * localStorage is an external system, so this is a useSyncExternalStore case
 * rather than state copied into React by an effect. */

const STORAGE_KEY = "td-clone:selection";

export interface SelectionState {
  ids: string[];
  /** False until localStorage has been read, so the prerendered markup and the
   * first client render agree before the stored grid appears. */
  ready: boolean;
}

const EMPTY: SelectionState = { ids: [], ready: false };

let snapshot: SelectionState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setIds(ids: string[]) {
  snapshot = { ids, ready: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or a full quota: the selection still works for this visit.
  }
  emit();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  let ids: string[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      ids = parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_RACERS);
    }
  } catch {
    // A corrupt entry just means starting with an empty selection.
  }
  snapshot = { ids, ready: true };
}

function subscribe(listener: () => void) {
  // Runs after the first render, so reading storage here keeps it out of render.
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

export function useSelection() {
  const { ids, ready } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((carId: string) => {
    const current = snapshot.ids;
    if (current.includes(carId)) setIds(current.filter((id) => id !== carId));
    else if (current.length < MAX_RACERS) setIds([...current, carId]);
  }, []);

  const remove = useCallback((carId: string) => {
    setIds(snapshot.ids.filter((id) => id !== carId));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  return {
    selectedIds: ids,
    isSelected: (carId: string) => ids.includes(carId),
    toggle,
    remove,
    clear,
    isFull: ids.length >= MAX_RACERS,
    ready,
  };
}
