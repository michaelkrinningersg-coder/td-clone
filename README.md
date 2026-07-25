# Top Drives Clone

Autos auswählen, sie auf Strecken fahren lassen, die Zeit aus echten Fahrzeugdaten
berechnen und in einer Rangliste einsortieren.

## Zwei Betriebsmodi

Ein Codebase, zwei Builds. Autos, Strecken und die Physik sind in beiden identisch —
nur die Ablage der Rundenzeiten unterscheidet sich.

| | Lokal (`npm run dev`) | GitHub Pages (statisch) |
|---|---|---|
| Zeiten | SQLite über `/api/*` | `localStorage` im Browser |
| Autos & Strecken | `src/data/` | `src/data/` |
| Physik | im Browser | im Browser |

Der statische Build wird über `NEXT_PUBLIC_STATIC_EXPORT=1` aktiviert. Die API-Routen
heißen `route.node.ts` und werden über `pageExtensions` in `next.config.ts` aus dem
statischen Build ausgeschlossen — `output: "export"` kann keine POST-Handler erzeugen.

## Einrichtung

```bash
npm install
npx prisma generate
npm run db:migrate     # legt dev.db an
npm run db:seed        # lädt Autos + Strecken in die DB
npm run dev
```

Statischen Build lokal testen:

```bash
NEXT_PUBLIC_STATIC_EXPORT=1 npm run build
npx serve out
```

## Autodaten

`npm run import:cars` holt Fahrzeuge von der [CarQuery API](https://www.carqueryapi.com/)
und übernimmt **nur** Autos, bei denen alle benötigten Werte vorhanden sind — Top-Speed,
0–100 km/h, Leistung, Gewicht, Drehmoment, Antriebsart und Kraftstoffart. Fehlt einer
davon, fliegt das Auto raus statt geschätzt zu werden. Ergebnis landet in
`src/data/cars.json`.

`src/data/cars.json` enthält aktuell einen kleinen, handgepflegten Platzhalter-Satz,
damit die App ohne API-Zugriff lauffähig ist.

## Physik

`src/lib/physics.ts` — kalibriert pro Auto aus genau zwei realen Werten:

- **Beschleunigung**: `v(t) = v_top · tanh(a_ref · t / v_top)`, wobei `a_ref` so gelöst
  wird, dass die Kurve exakt die reale 0-100-km/h-Zeit trifft.
- **Kurven**: Grenzgeschwindigkeit aus Kurvenradius, Leistungsgewicht, Drehmoment/Gewicht
  und Antriebsart (AWD leicht im Vorteil, FWD leicht im Nachteil).
- **Steigung**: reine Physik (`g · sin θ`), gewichtsunabhängig.

Strecken sind Segmentfolgen (Gerade / Kurve mit Radius, jeweils optional mit Steigung)
in `src/data/tracks.ts`, angelehnt an die realen Eckdaten von Monza, Spa, Monaco und
Pikes Peak — plus vier reine Sprintstrecken.

## Deployment

- `.github/workflows/tag.yml` — jeder Push auf `main` erzeugt einen neuen Patch-Tag.
- `.github/workflows/deploy-pages.yml` — jeder Tag `v*.*.*` baut den statischen Export
  und deployt ihn auf GitHub Pages.

Einmalig nötig: **Settings → Pages → Source: GitHub Actions**.
