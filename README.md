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
0–100 km/h, Leistung, Gewicht, Drehmoment, Antriebsart, Kraftstoffart, cw-Wert, Breite,
Höhe, Bremsen vorn und hinten, Reifenbreite und Getriebe. Fehlt einer davon, fliegt das
Auto raus statt geschätzt zu werden. Ergebnis landet in `src/data/cars.json` und ist
eingecheckt, der Import muss also nicht laufen, um die App zu starten.

Der Trichter von 30.066 Motorvarianten auf 5.472 Autos:

| Schritt | bleiben |
|---|---|
| vollständige, plausible Daten | 16.932 |
| Varianten mit identischen Fahrwerten zusammengefasst | 16.812 |
| je Marke + Modell + Baujahr nur Einstiegs- und Topmotorisierung | 5.472 |

Der letzte Schritt wirft die Zwischenmotorisierungen weg: die Quelle führt jede je
verkaufte Version, etwa 46 Ausführungen des Volvo S80 von 2009. Gruppiert wird bewusst
inklusive Baujahr — über alle Jahre zu gruppieren würde einen 5er von 1995 und einen von
2020 in dieselbe Gruppe legen und jede Generation dazwischen löschen.
`MAX_CARS=600 npm run import:cars` begrenzt die Menge zusätzlich.

Der Datensatz führt keine Lizenzdatei und ist von autoevolution.com gescrapt — für einen
anderen Einsatzzweck wäre das vorab zu klären.

## Physik

`src/lib/physics.ts` rechnet Schritt für Schritt über die Strecke. Jeder Wert kommt
entweder aus dem Datensatz oder ist eine offen benannte Konstante — geschätzte
Einzelwerte pro Auto gibt es nicht.

**Antrieb.** Nenndrehzahl aus `P = M · ω`: der Datensatz führt keine Drehzahlen, aber
Leistung und Drehmoment implizieren eine. Das trennt den Turbodiesel (Golf GTD ~3.500/min)
vom hochdrehenden Sauger (S2000 ~8.100/min) und trifft die realen Werte erstaunlich gut
(Chiron 6.719 gegen real 6.700). Daraus folgen Drehmomentverlauf und Gangstufen: der
oberste Gang liegt dort, wo der Motor gegen die Luft ausläuft, die übrigen geometrisch
darunter. Die Form der Drehmomentkurve hängt am Motorcharakter — ein breit auslegender
Motor zieht unten heraus, ein spitzer hält oben länger.

**Grenzen nach oben.** Kein festes Tempolimit. Ein Auto läuft, bis der Luftwiderstand
(cw × Stirnfläche) es einholt oder der Drehzahlbegrenzer im obersten Gang greift. Die
angegebene Höchstgeschwindigkeit sagt, wie der Hersteller das Auto gezügelt hat, nicht was
es kann, und geht deshalb nicht ins Modell ein.

**Kalibrierung.** Der einzige gelöste Parameter ist die Traktionsgrenze beim Start: sie
wird so bestimmt, dass die Simulation die reale 0-100-km/h-Zeit trifft.

**Bremsen und Kurven.** Verzögerung aus der verbauten Bremse (belüftete Scheibe / Scheibe /
Trommel, vorn schwerer gewichtet). Kurventempo aus Radius, Reifenbreite je Tonne und
Antriebsart. Ein Rückwärtslauf über die Strecke setzt daraus die Bremspunkte, ein
Vorwärtslauf beschleunigt dazwischen.

**Steigung.** Reine Physik (`g · sin θ`).

## Strecken

Die drei Rundkurse in `src/data/tracks.ts` sind als **geschlossene Umrisse** hinterlegt —
eine Punktfolge in Metern mit dem Kurvenradius an jedem Punkt. Daraus leitet
`src/lib/track-outline.ts` die Segmentliste ab: jede Ecke wird durch einen Bogen ersetzt,
der beide Schenkel berührt.

Vorher waren die Strecken Kurve für Kurve aufgeschrieben, und nichts band die letzte
Kurve an die erste zurück: keine Runde schloss sich, Monaco drehte sich um 588° statt 360°
und endete 1,8 km neben der Linie. Als Umriss gezeichnet schließt die Runde, weil die Form
es tut — und die Radien, mit denen die Physik rechnet, sind die Radien der gezeichneten
Linie. Ein Test hält für jeden Kurs fest, dass die Lücke unter einem Meter bleibt.

Die Umrisse sind nach den echten Layouts von Hand gezeichnet (Kurvenfolge, Charakter,
Drehrichtung, Steigungen) und anschließend auf die reale Streckenlänge skaliert. Sie sind
eine Ähnlichkeit, keine Vermessung.

Pikes Peak bleibt eine Segmentliste: ein Bergrennen ist keine Runde und hat sich nicht zu
schließen. Dazu kommen vier reine Sprintstrecken.

Die Kurvenrichtung geht **nicht** in die Zeit ein — sie entscheidet nur, wohin sich die
Linie dreht.

## Tests

```bash
npm test
```

Deckt Motor- und Getriebemodell, die Kalibrierung auf die reale 0-100-Zeit, Bremsen,
Kurven, Steigungen, Wertungen und den Importfilter ab — insbesondere, dass ein Auto mit
fehlendem oder unmöglichem Wert wirklich verworfen und nicht geschätzt wird.

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
