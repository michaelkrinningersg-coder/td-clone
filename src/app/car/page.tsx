"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getCar } from "@/lib/data";
import { CarDetail } from "@/components/CarDetail";

/** One page for all 5.503 cars, addressed by query rather than by path.
 *
 * A route segment would prerender a file per car in the static export, which
 * is thousands of pages for something every visitor reaches from the list
 * anyway. The car data ships with the bundle, so the page can find its car
 * without a request. */
function CarPageBody() {
  const id = useSearchParams().get("id") ?? "";
  const car = getCar(id);

  if (!car) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold text-white">Auto nicht gefunden</h1>
        <p className="mt-2 text-zinc-400">
          {id ? `Zur Kennung „${id}" gibt es kein Auto.` : "Es wurde kein Auto angegeben."}
        </p>
        <Link href="/cars" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          Autos durchsehen →
        </Link>
      </div>
    );
  }

  return <CarDetail car={car} />;
}

export default function CarPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-5xl px-6 py-10 text-zinc-400">Lade...</div>}>
      <CarPageBody />
    </Suspense>
  );
}
