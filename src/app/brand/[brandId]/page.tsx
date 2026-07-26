import Link from "next/link";
import { notFound } from "next/navigation";
import { brands, getBrand } from "@/lib/data";
import { CarList } from "@/components/CarList";

export function generateStaticParams() {
  return brands.map((brand) => ({ brandId: brand.id }));
}

export default async function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const brand = getBrand(brandId);
  if (!brand) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
        ← Alle Marken
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-white">{brand.name}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {brand.cars.length} {brand.cars.length === 1 ? "Auto" : "Autos"} · {brand.yearFrom}–{brand.yearTo} · bis{" "}
        {brand.maxPowerPs} PS
      </p>

      <CarList cars={brand.cars} searchPlaceholder={`${brand.name} durchsuchen...`} />
    </div>
  );
}
