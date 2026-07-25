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

`npm run import:cars` lädt den von autoevolution abgeleiteten Spec-Datensatz
[ilyasozkurt/automobile-models-and-specs](https://github.com/ilyasozkurt/automobile-models-and-specs)
und übernimmt **nur** Autos, bei denen alle benötigten Werte vorhanden sind — Top-Speed,
0–100 km/h, Leistung, Gewicht, Drehmoment, Antriebsart und Kraftstoffart. Fehlt einer
davon, fliegt das Auto raus statt geschätzt zu werden. Ergebnis landet in
`src/data/cars.json` und ist eingecheckt, der Import muss also nicht laufen, um die App
zu starten.

Aus 30.066 Motorvarianten bleiben so 5.100 Autos: pro Modell und Baujahr die stärkste
Variante, entdoppelt über die Auto-ID, plus ein Plausibilitätsfilter gegen offensichtlich
kaputte Quellzeilen. `MAX_CARS=600 npm run import:cars` begrenzt die Menge.

Der Datensatz führt keine Lizenzdatei und ist von autoevolution.com gescrapt — für einen
anderen Einsatzzweck wäre das vorab zu klären.

## Physik

`src/lib/physics.ts` — kalibriert pro Auto aus genau zwei realen Werten:

- **Beschleunigung**: `v(t) = v_top · tanh(a_ref · t / v_top)`, wobei `a_ref` so gelöst
  wird, dass die Kurve exakt die reale 0-100-km/h-Zeit trifft.
- **Kurven**: Grenzgeschwindigkeit aus Kurvenradius, Leistungsgewicht, Drehmoment/Gewicht
  und Antriebsart (AWD leicht im Vorteil, FWD leicht im Nachteil).
- **Steigung**: reine Physik (`g · sin θ`), gewichtsunabhängig.

Strecken sind Segmentfolgen (Gerade / Kurve mit Radius, Richtung und optionaler Steigung)
in `src/data/tracks.ts`, angelehnt an die realen Eckdaten von Monza, Spa, Monaco und
Pikes Peak — plus vier reine Sprintstrecken.

Die Kurvenrichtung ist reine Zeichen-Information und geht **nicht** in die Zeit ein — sie
sorgt dafür, dass jede Strecke ihre eigene wiedererkennbare Form bekommt statt eines
generischen Zickzacks. Da die Segmentdaten Näherungen sind, ist die gezeichnete Linie
eine stilisierte Ähnlichkeit und schließt sich nicht exakt zur Runde.

## Tests

```bash
npm test
```

Deckt die Kalibrierung der Beschleunigungskurve (trifft die reale 0-100-Zeit, überschreitet
nie den Top-Speed), das Kurven- und Steigungsverhalten sowie den CarQuery-Importfilter ab —
insbesondere, dass ein Auto mit fehlendem Wert wirklich verworfen und nicht geschätzt wird.

## Deployment

`.github/workflows/release.yml` — Push auf `main` → neuer Patch-Tag → statischer Export
genau dieses Tags → GitHub Pages.

Tag und Deploy stecken bewusst in **einem** Workflow: GitHub startet grundsätzlich keinen
Workflow aus einem Event, das vom Standard-`GITHUB_TOKEN` ausgelöst wurde. Ein Tag aus
einem separaten Tag-Workflow würde einen eigenständigen Deploy-Workflow also nie
auslösen — die Kette bliebe stillschweigend stehen.

Einmalig nötig:

- **Settings → Pages → Source: GitHub Actions**
- **Settings → Actions → General → Workflow permissions: Read and write** (sonst darf
  der Workflow keinen Tag pushen)
