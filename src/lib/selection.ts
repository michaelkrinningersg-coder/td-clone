"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAX_RACERS } from "@/lib/race";
import { EMPTY_FILTER, type CarFilter } from "@/lib/filters";

/** The track, the picked cars and the filter all have to survive navigating
 * between brands, so they live outside React in a small store mirrored to
 * localStorage. The order of the cars matters: it decides which racing colour
 * each one gets.
 *
 * localStorage is an external system, so this is a useSyncExternalStore case
 * rather than state copied into React by an effect. */

const STORAGE_KEY = "td-clone:session";

export interface SessionState {
  trackId: string | null;
  carIds: string[];
  /** Starred cars. Independent of the grid: the garage is a shortlist that
   * survives clearing the field and switching tracks. */
  garageIds: string[];
  filter: CarFilter;
  /** False until localStorage has been read, so the prerendered markup and the
   * first client render agree before the stored session appears. */
  ready: boolean;
}

const EMPTY: SessionState = {
  trackId: null,
  carIds: [],
  garageIds: [],
  filter: EMPTY_FILTER,
  ready: false,
};

let snapshot: SessionState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function persist(next: SessionState) {
  snapshot = next;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trackId: next.trackId,
        carIds: next.carIds,
        garageIds: next.garageIds,
        filter: next.filter,
      }),
    );
  } catch {
    // Private mode or a full quota: the session still works for this visit.
  }
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  let restored: SessionState = { ...EMPTY, ready: true };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      restored = {
        trackId: typeof parsed.trackId === "string" ? parsed.trackId : null,
        carIds: Array.isArray(parsed.carIds)
          ? parsed.carIds.filter((id: unknown): id is string => typeof id === "string").slice(0, MAX_RACERS)
          : [],
        garageIds: Array.isArray(parsed.garageIds)
          ? parsed.garageIds.filter((id: unknown): id is string => typeof id === "string")
          : [],
        // Merged onto the defaults so a filter added later does not arrive undefined.
        filter: { ...EMPTY_FILTER, ...(parsed.filter ?? {}) },
        ready: true,
      };
    }
  } catch {
    // A corrupt entry just means starting fresh.
  }
  snapshot = restored;
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

export function useSession() {
  const { trackId, carIds, garageIds, filter, ready } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setTrack = useCallback((id: string | null) => {
    persist({ ...snapshot, trackId: id, ready: true });
  }, []);

  const toggleCar = useCallback((carId: string) => {
    const current = snapshot.carIds;
    if (current.includes(carId)) {
      persist({ ...snapshot, carIds: current.filter((id) => id !== carId), ready: true });
    } else if (current.length < MAX_RACERS) {
      persist({ ...snapshot, carIds: [...current, carId], ready: true });
    }
  }, []);

  const removeCar = useCallback((carId: string) => {
    persist({ ...snapshot, carIds: snapshot.carIds.filter((id) => id !== carId), ready: true });
  }, []);

  const clearCars = useCallback(() => {
    persist({ ...snapshot, carIds: [], ready: true });
  }, []);

  /** Replaces the whole grid at once, e.g. from the random picker. */
  const setCars = useCallback((ids: string[]) => {
    persist({ ...snapshot, carIds: ids.slice(0, MAX_RACERS), ready: true });
  }, []);

  const toggleGarage = useCallback((carId: string) => {
    const current = snapshot.garageIds;
    persist({
      ...snapshot,
      garageIds: current.includes(carId) ? current.filter((id) => id !== carId) : [...current, carId],
      ready: true,
    });
  }, []);

  const clearGarage = useCallback(() => {
    persist({ ...snapshot, garageIds: [], ready: true });
  }, []);

  const setFilter = useCallback((next: CarFilter) => {
    persist({ ...snapshot, filter: next, ready: true });
  }, []);

  const resetFilter = useCallback(() => {
    persist({ ...snapshot, filter: EMPTY_FILTER, ready: true });
  }, []);

  return {
    trackId,
    selectedIds: carIds,
    garageIds,
    filter,
    ready,
    isSelected: (carId: string) => carIds.includes(carId),
    isFull: carIds.length >= MAX_RACERS,
    isInGarage: (carId: string) => garageIds.includes(carId),
    setTrack,
    toggleCar,
    removeCar,
    clearCars,
    setCars,
    toggleGarage,
    clearGarage,
    setFilter,
    resetFilter,
  };
}
