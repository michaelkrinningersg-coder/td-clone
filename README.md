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

`npm run import:tracks` lädt die **vermessenen Streckenmittellinien** und rechnet sie in
Meter um nach `src/data/track-outlines.ts`. Drei Quellen, unter denen allen
OpenStreetMap-Vermessungen liegen — die Geometrie steht deshalb durchweg unter der ODbL,
© OpenStreetMap-Mitwirkende:

| Quelle | was sie beisteuert | Lizenz |
|---|---|---|
| [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) | alle 40 Formel-1-Kurse, GeoJSON in Länge/Breite | ODbL |
| [tobi/track-atlas](https://github.com/tobi/track-atlas) | der Rest der Rennwelt — IMSA, Le-Mans-Kurse, Clubstrecken | MIT (Repo), ODbL (Geometrie) |
| [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database) | DTM-Kurse und das Indianapolis-Oval, CSV bereits in Metern | LGPL-3.0 |

Aus dem Punktzug leitet `src/lib/track-polyline.ts` die Segmente ab: die Krümmung wird
entlang der Linie gemessen, benachbarte Punkte gleicher Krümmungsrichtung zu einer Kurve
zusammengefasst, deren Radius aus dem Bogen selbst folgt — zurückgelegte Strecke geteilt
durch gedrehten Winkel. Die Drehrichtung gehört zur Klassifikation, sonst würde sich in
einer Schikane die Rechts- gegen die Linkskurve aufheben und aus zwei engen Kurven ein
schneller Knick.

Gezeichnet wird der vermessene Punktzug selbst, nicht die zurückgerechnete Segmentliste.
So ist die Form auf dem Bildschirm die echte Geometrie der Strecke, und die Runde schließt
sich, weil die Vermessung es tut.

Nur die **Steigungen** sind von Hand gesetzt: OpenStreetMap führt keine Höhen, und eine
Runde Spa ohne den Anstieg durch Eau Rouge wäre eine andere Strecke. Sie liegen als Bänder
über dem Rundenanteil in `src/data/tracks.ts` — für Spa, Monaco, Interlagos, den Red Bull
Ring, Austin, Imola, Mugello, Zandvoort, Portimão, den Nürburgring, Watkins Glen, Kyalami,
Istanbul, Laguna Seca (der Corkscrew fällt 18 m auf 140 m), Road Atlanta, Virginia, Mosport,
Brands Hatch, Road America, Lime Rock und Fuji. Die flachen Kurse fahren ohne, weil sie es
real auch tun.

**55 vermessene Rundkurse.** Aus der Formel 1 alles, was die Quelle führt: Monza, Spa, Monaco, Suzuka,
Silverstone, Hungaroring, Interlagos, Montreal, Red Bull Ring, Zandvoort, Baku, Austin,
Imola, Singapur, Mugello, Jeddah, Mexiko-Stadt, Bahrain, Shanghai, Istanbul, Sepang,
Melbourne, Portimão, Barcelona, Hockenheim, Nürburgring GP (nicht die Nordschleife),
Yas Marina, Paul Ricard, Las Vegas, Watkins Glen, Indianapolis, Kyalami, Estoril,
Magny-Cours, Losail, Miami, Sochi, Madrid, Buenos Aires und Jacarepaguá. Dazu von außerhalb
der Formel 1: Lime Rock Park, Long Beach, Laguna Seca, Mosport, Road Atlanta, Fuji, Virginia
International, Daytona (Rundkurs), Sebring, Road America, Brands Hatch, Norisring,
Oschersleben, Moscow Raceway und das **Indianapolis-Oval** — vier Kurven mit 256 m Radius und
vier Geraden à 1.036 m. Real sind die mit 9° überhöht; Steilkurven kennt das Modell nicht, im
Spiel sind es also langsame Kurven.

Dazu vier konstruierte, die jeweils eine andere Frage stellen: Handlingkurs, Stadtkurs
(rund sechzehn Kurven je Kilometer), Kreisbahn mit 200 m Radius (nur Grip, keine Leistung)
und ein Trioval über 4,5 km (nur Leistung gegen Luftwiderstand).

Was nicht vermessen ist, ist konstruiert und braucht keine Vermessung: Handlingkurs und
Stadtkurs entstehen aus gelappten Kurven (`r = 1 + 0,42·sin 3θ + 0,16·sin 5θ` bzw. drei
höhere Harmonische für rund sechzehn Kurven je Kilometer), Kreisbahn und Trioval aus ihrer
Geometrie — eine geschlossene Kurve ist von selbst geschlossen, und dieselbe
Krümmungsmessung findet darin die Kurven. Slalom und Bremstests sind offene Segmentfolgen,
weil sie Punkt zu Punkt gehen. Die Trioval-Kurven sind flach: Steilkurven kennt das Modell
nicht.

Pikes Peak bleibt eine Segmentliste ohne Umriss: ein Bergrennen ist keine Runde und hat
sich nicht zu schließen. Dazu kommen fünf reine Sprintstrecken von 100 bis 2000 Metern —
die kürzeste ist vorbei, bevor die meisten Autos aus dem zweiten Gang sind, und fragt damit
nur nach Traktion und den ersten beiden Übersetzungen.

Zwei Strecken sind gar keine Strecken, sondern Messungen gegen den Tacho: **0-100-0 km/h**
und **Rollstart 50-100 km/h**. Dort steht die Distanz nicht fest, sondern fällt aus dem Lauf
heraus — die angegebene Länge ist nur die gezeichnete Linie, auf der die Autos nebeneinander
laufen. Wer die Zielgeschwindigkeit nicht erreicht, bekommt nach zwei Minuten diese zwei
Minuten als Platzhalter; ohne den käme ein Auto, dessen Höchstgeschwindigkeit unter dem Ziel
liegt, nie zu einer Zeit.

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
