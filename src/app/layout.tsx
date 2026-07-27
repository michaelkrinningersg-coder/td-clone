import type { Metadata } from "next";
import { Anton, Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { SelectionBar } from "@/components/SelectionBar";
import "./globals.css";

const barlow = Barlow({ variable: "--font-barlow", weight: ["400", "500", "600", "700"], subsets: ["latin"] });
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Top Drives Clone",
  description: "Autos auswaehlen, auf echten Strecken Zeiten fahren, Rangliste vergleichen.",
};

const NAV = [
  { href: "/", label: "Strecken" },
  { href: "/cars", label: "Autos" },
  { href: "/garage", label: "Garage" },
  { href: "/championship", label: "Meisterschaft" },
  { href: "/duel", label: "Duell" },
  { href: "/standings", label: "Wertung" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      className={`${barlow.variable} ${barlowCondensed.variable} ${anton.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#100e0c] text-[#f5efe6]">
        <header className="flex h-15 items-center gap-6 border-b border-[#26211c] px-6">
          <Link
            href="/"
            className="whitespace-nowrap font-[family-name:var(--font-anton)] text-[22px] uppercase tracking-[0.01em] text-[#f5efe6]"
          >
            Top<span className="text-[#e2492f]">/</span>Drives
          </Link>
          <nav className="flex gap-5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="label pb-[3px] text-[12px] text-[#8b8177] transition-colors hover:text-[#f5efe6]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <SelectionBar />
      </body>
    </html>
  );
}
