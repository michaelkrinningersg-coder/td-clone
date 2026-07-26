import { brands } from "@/lib/data";
import { BrandCars } from "./BrandCars";

export function generateStaticParams() {
  return brands.map((brand) => ({ brandId: brand.id }));
}

export default async function BrandPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  return <BrandCars brandId={brandId} />;
}
