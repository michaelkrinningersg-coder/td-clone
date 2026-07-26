"use client";

import { useState } from "react";

/** A destructive button that asks first, in the same two-step shape the × on a
 * single ranking row uses: one click arms it, a second one goes through.
 * Nothing here is recoverable, so there is no undo to fall back on. */
export function ResetButton({
  label,
  question,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  label: string;
  /** Shown once armed, so it is clear what is about to disappear. */
  question: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-red-900 hover:bg-red-950/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-1.5">
      <span className="text-xs text-red-200">{question}</span>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
      >
        {busy ? "..." : confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="rounded-full px-2 py-1 text-xs text-zinc-400 hover:text-white"
      >
        Abbrechen
      </button>
    </span>
  );
}
