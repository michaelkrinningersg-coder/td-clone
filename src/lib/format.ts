export function formatTimeMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  }
  return `${seconds.toFixed(2)}s`;
}

/** A total added up over several tracks, which runs past an hour as soon as
 * Pikes Peak is in the mix - so unlike a lap time this one needs an hour
 * field, and it never falls back to bare seconds. */
export function formatDurationMs(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms - hours * 3_600_000) / 60_000);
  const seconds = (ms - hours * 3_600_000 - minutes * 60_000) / 1000;
  const tail = `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
  return hours > 0 ? `${hours}:${tail}` : `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}
