import { StandingsTabs } from "@/components/StandingsTabs";

export default function StandingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Wertung</h1>
      <StandingsTabs />
    </div>
  );
}
