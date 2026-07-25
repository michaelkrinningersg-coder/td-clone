/** Deterministic, URL-safe id derived from a car's or track's identity.
 * Both the SQLite path and the static/localStorage path use these, so a time
 * recorded in one mode refers to the same car/track in the other. */
export function slugify(...parts: (string | number)[]): string {
  return parts
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function carSlug(car: { make: string; model: string; year: number }): string {
  return slugify(car.make, car.model, car.year);
}

export function trackSlug(track: { name: string }): string {
  return slugify(track.name);
}
