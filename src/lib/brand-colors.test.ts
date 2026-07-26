import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandColor } from "./brand-colors";
import { brands } from "./data";

describe("brandColor", () => {
  it("gives the same marque the same colour every time", () => {
    assert.equal(brandColor("Volkswagen"), brandColor("Volkswagen"));
  });

  it("ignores case and surrounding space", () => {
    assert.equal(brandColor("ferrari"), brandColor("  Ferrari "));
  });

  it("uses the known colour where a marque has one", () => {
    assert.equal(brandColor("Ferrari"), "#ef4444");
    assert.equal(brandColor("Lamborghini"), "#eab308");
  });

  it("derives a colour for marques that have no named one", () => {
    assert.match(brandColor("Wiesmann"), /^hsl\(\d{1,3} \d{2}% \d{2}%\)$/);
  });

  it("returns a usable colour for every marque in the dataset", () => {
    for (const brand of brands) {
      const color = brandColor(brand.name);
  assert.match(color, /^(#[0-9a-f]{6}|hsl\(\d{1,3} \d{2}% \d{2}%\))$/, `${brand.name} -> ${color}`);
    }
  });

  // Every derived colour has to stay readable on the dark background, so the
  // steps are bounded rather than free.
  it("keeps derived colours inside the legible range", () => {
    for (const brand of brands) {
      const color = brandColor(brand.name);
      if (!color.startsWith("hsl")) continue;
      const [, sat, light] = color.match(/hsl\(\d{1,3} (\d{2})% (\d{2})%\)/)!.map(Number);
      assert.ok(sat >= 50 && sat <= 85, `${brand.name} saturation ${sat}`);
      assert.ok(light >= 55 && light <= 78, `${brand.name} lightness ${light}`);
    }
  });

  // Hue alone put Honda, Volkswagen and Citroen on nearly the same green.
  // Varying saturation and lightness too is what pulls them apart.
  it("separates marques whose hues land close together", () => {
    const trio = ["Honda", "Volkswagen", "Citroen"].map(brandColor);
    assert.equal(new Set(trio).size, 3);
  });

  it("spreads marques across the hue circle rather than clustering them", () => {
    const hues = brands
      .map((b) => brandColor(b.name))
      .filter((c) => c.startsWith("hsl"))
      .map((c) => Number.parseInt(c.slice(4), 10));
    // Six 60-degree sectors; a usable spread hits every one of them.
    const sectors = new Set(hues.map((h) => Math.floor(h / 60)));
    assert.equal(sectors.size, 6, `only hit sectors ${[...sectors].sort().join(",")}`);
  });
});
