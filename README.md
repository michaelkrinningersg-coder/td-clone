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

### Warum die Zeiten nicht im Repo liegen

Naheliegende Idee, geht aber nicht: GitHub Pages liefert nur statische Dateien aus. Eine
SQLite-Datei im Repo könnte der Browser per WASM zwar **lesen**, aber jeder Schreibvorgang
müsste über die GitHub-API zurück — und der dafür nötige Token wäre für jeden Besucher
sichtbar. Eine Repo-Datenbank wäre also eine schreibgeschützte Bestenliste, keine, in die
gefahren werden kann.

Stattdessen ist der Browser-Speicher so weit geschrumpft, dass er das ganze Feld fasst —
siehe unten.

### Wie die Zeiten im Browser abgelegt sind

`src/lib/time-codec.ts`. Der Browser gibt einer Seite rund fünf Megabyte, und das gesamte
Feld auf allen Strecken sind 5.451 × 70 = 381.570 Zeiten. Als JSON-Objekte wären das 68 MB
— das Kontingent war nach etwa 28 Meisterschaften voll, mit einem `setItem`-Fehler mitten im
Lauf.

Zwei Ideen erledigen das. Die Auto- und Streckenkennungen sind der Großteil einer Zeit — ein
Slug wie `porsche-cayenne-turbo-s-955-2006-4-5l-v8-6at` sind fünfzig Zeichen, wiederholt für
jede Strecke, die das Auto gefahren ist —, also steht jede Kennung **einmal** in einem
Wörterbuch und wird danach über eine Nummer angesprochen. Und die Nummern liegen als Bytes
statt als JSON: **6 Byte je Zeit** (Auto 2, Strecke 1, Millisekunden 3).

| | Zeiten | Speicher |
|---|---|---|
| eine Meisterschaft (100 Autos × 10 Strecken) | 1.000 | 49 KiB |
| zehn Meisterschaften | 10.000 | 303 KiB |
| **das gesamte Feld auf allen Strecken** | **381.570** | **3,2 MB** |

Das Wörterbuch amortisiert sich: 50 Zeichen je Zeit bei tausend Einträgen, 8,6 bei
Volllast. Bewusst das Wörterbuch und nicht die Position eines Autos im Feld — die wäre noch
kleiner, aber das Feld wird bei jedem Reimport neu gebaut (viermal allein in dieser
Entwicklung), und jede gespeicherte Zeit zeigte danach auf das falsche Auto. Kennungen
wandern nicht.

Ältere Ablageformate werden weiter gelesen und beim nächsten Schreiben umgestellt, ein
Update kostet also niemanden seine Historie. Ist der Speicher trotzdem voll, sagt
`StorageFullError`, wie viele Zeiten drin sind und dass ein Zurücksetzen in der Wertung
hilft — statt „Failed to execute setItem on Storage".

### Spielstand

Trotzdem liegt der Fortschritt nur in **einem** Browser. Unter *Wertung → Spielstand* geht
alles davon als Datei raus und wieder rein: jede gefahrene Zeit, dazu eine laufende
Meisterschaft, ein laufendes Duell und die aktuelle Auswahl. Bewusst lesbares JSON statt des
gepackten Speicherformats — eine Austauschdatei soll sich öffnen, lesen und notfalls von Hand
ändern lassen; das Packen löst ein Browser-Kontingent, das eine Datei auf der Platte nicht
hat. Die Zeiten stehen als Tupel drin, weil sie den Großteil ausmachen: tausend Zeiten sind
so 76 KB statt 190.

Beim Einlesen zwei Wege:

- **Zusammenführen** behält je Auto und Strecke die schnellere Zeit — dieselbe Regel, der
  auch ein wiederholter Lauf folgt. Den eigenen Spielstand zurückzuladen ändert deshalb
  garantiert nichts, was ein Test festhält.
- **Ersetzen** wirft alles Vorhandene weg und übernimmt nur die Datei, samt laufender Serien.
  Zwei halbfertige Meisterschaften ineinanderzufalten ergibt keinen Sinn, deshalb reisen die
  nur auf diesem Weg mit.

Zeiten, deren Auto oder Strecke es in dieser Version nicht mehr gibt — der Importfilter wirft
gelegentlich Autos raus —, werden gezählt und übersprungen statt in eine Rangliste
geschmuggelt, in der nichts über sie nachschlagbar wäre. Eine Datei, die kein Spielstand ist,
sagt das im Klartext, statt einfach nicht zu funktionieren.

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
Höhe, Radstand, Bremsen vorn und hinten, Reifenbreite, Zylinderzahl und Getriebe. Fehlt einer davon, fliegt das
Auto raus statt geschätzt zu werden. Ergebnis landet in `src/data/cars.json` und ist
eingecheckt, der Import muss also nicht laufen, um die App zu starten.

Zwei Plausibilitätsprüfungen greifen nicht auf einzelne Werte, sondern auf deren
Widerspruch zueinander. Leistung und Drehmoment legen über `P = M · ω` die Nenndrehzahl
fest; liegt die außerhalb von 2.000 bis 9.550/min, ist nicht der Motor ungewöhnlich,
sondern die Zahl falsch gelesen — die Quelle führt einen Toyota Auris mit 90 PS bei 20 Nm,
was 32.000/min entspräche, und einen Mercedes 160 CDI mit 1.801 Nm, was 330/min entspräche.
Und die halbe Bewegungsenergie geteilt durch die Leistung ist eine Untergrenze für 0–100,
unter die kein Getriebe und kein Reifen kommt; ein BMW X1 mit 125 PS und 1.745 kg in 7,0 s
liegt darunter. Zusammen fliegen 11 Autos raus, die sich nicht reparieren lassen, ohne
einen Wert zu erfinden.

Der Trichter von 30.066 Motorvarianten auf 5.451 Autos:

| Schritt | bleiben |
|---|---|
| vollständige, plausible Daten | 16.850 |
| Varianten mit identischen Fahrwerten zusammengefasst | 16.732 |
| je Marke + Modell + Baujahr nur Einstiegs- und Topmotorisierung | 5.451 |

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

Zwei Dinge folgen ebenfalls der Nenndrehzahl statt fest zu sein. Die **Getriebespreizung**:
wer bis 8.000/min zieht, deckt in einem Gang ab, was ein Diesel bei 3.700/min auf zwei
verteilen muss — reale Diesel spreizen 5 bis 6, hochdrehende Sauger eher 4. Und die
**Abregeldrehzahl**: ein Diesel mit Leistungsspitze bei 3.800/min dreht noch bis etwa
5.000, ein Sauger mit Spitze bei 6.500 hat kaum 500 Umdrehungen übrig (1,3 gegen 1,05 der
Nenndrehzahl). Beides zusammen halbiert den Anteil der Autos, deren angegebene
0-100-Zeit das Modell selbst mit perfekter Traktion nicht erreicht, von 22,5 % auf 8,3 %
(Rückstand über 0,5 s: 1.229 → 454 Autos, über 2 s: 179 → 55).

Nebenbei bekommt die Gangzahl damit ein echtes Optimum statt einer Einbahnstraße: engere
Stufen halten den Motor näher an der Leistungsspitze, jeder Schaltvorgang kostet Zugkraft.
Für den Golf GTI auf 2.000 m liegt das Minimum bei sechs Gängen, drei und neun sind beide
langsamer.

**Grenzen nach oben.** Kein festes Tempolimit. Ein Auto läuft, bis der Luftwiderstand
(cw × Stirnfläche) es einholt oder der Drehzahlbegrenzer im obersten Gang greift. Die
angegebene Höchstgeschwindigkeit sagt, wie der Hersteller das Auto gezügelt hat, nicht was
es kann, und geht deshalb nicht ins Modell ein.

**Schaltzeiten.** Nicht zwei Werte für „Handschaltung oder nicht", sondern der Getriebetyp,
den die Quelle beim Namen nennt: Doppelkupplung 0,05 s, Wandlerautomatik 0,25 s,
Handschaltung 0,45 s, automatisiertes Schaltgetriebe (Selespeed, Easytronic) 0,60 s, CVT
schaltet gar nicht. Im Feld: 3.213 Handschalter, 1.875 Wandler, 358 Doppelkupplungen, 9
automatisierte, 1 CVT. Was der String nicht festlegt, gilt als Wandlerautomatik — ein
unqualifiziertes „Automatic" ist fast immer eine. Das benachteiligt die Doppelkupplungen,
die ein Hersteller schlicht als Automatik verkauft hat (ein BMW M4 GTS steht als „7AT" da
und ist real ein DKG); sie verlieren eine Zehntelsekunde je Schaltvorgang, die sie nicht
verlieren sollten.

**Radlastverlagerung.** Unter Beschleunigung wandert Last nach hinten, um `m · a · h / L`.
Ein heckgetriebenes Auto drückt seine Antriebsreifen dabei auf die Straße, ein
frontgetriebenes hebt sie an — deshalb kann ein starker Fronttriebler seine Leistung nicht
loswerden, und deshalb startet ein langes flaches Auto besser als ein kurzes hohes. Radstand
und Höhe sind gemessen; die Verlagerung hängt von der Beschleunigung ab und die
Beschleunigung von der Verlagerung, also wird nicht iteriert, sondern aufgelöst:

```
F = μ · (s · W − σ · k · R) / (1 − σ · μ · k),   k = h / L
```

σ ist +1 hinten, −1 vorn, 0 bei Allrad, wo sich die Verlagerung zwischen angetriebenen
Achsen aufhebt.

Zwei Zahlen darin kann der Datensatz **nicht** liefern: die Schwerpunkthöhe und die statische
Achslastverteilung. Beide folgen aus der Motorlage, und die Quelle führt in 65 Feldern
keines dazu — nicht vorn/mitte/hinten, nicht längs/quer. Statt sie je Auto zu erfinden steht
dort je eine benannte Konstante für alle: Schwerpunkt bei 38 % der Dachhöhe, statisch 50/50.

**Kalibrierung.** Der einzige gelöste Parameter ist der Reifengrip beim Start: er wird so
bestimmt, dass die Simulation die reale 0-100-km/h-Zeit trifft. Seit der Radlastverlagerung
ist das ein Reibbeiwert statt einer Kraft — und er landet dort, wo ein Straßenreifen lebt:
Median 1,07 vorn, 1,11 hinten, 0,83 bei Allrad, der am wenigsten Grip braucht, weil alle vier
Räder ziehen.

**Bremsfading.** Bremsen werden heiß und lassen nach. Energie hinein, wo das Auto verzögert,
Energie hinaus nach Fahrtwind — deshalb erholen sie sich auf einer langen Geraden und nie auf
einem Stadtkurs. Kapazität in Joule je Kilogramm Auto, damit sie über das ganze Feld
vergleichbar ist: belüftete Scheibe 6.000, Scheibe 3.500, Trommel 1.500. Eine harte
Verzögerung von 250 auf 100 km/h sind rund 2.000 J/kg, eine belüftete Scheibe hält also etwa
drei davon aus, eine Trommel knapp eine.

Die Runde wird deshalb zweimal gefahren: einmal mit kalten Bremsen, um zu sehen, wie viel
gebremst wird, und einmal mit den Bremsen so heiß, wie die erste Runde sie gemacht hat. Eine
Iteration reicht — Fading lässt früher und sanfter bremsen, was kühlt, die Rückkopplung
arbeitet gegen sich selbst.

Gemessen über 2.400 Läufe: 158 gehen über die Fadinggrenze. Nach Bremsenart sind das 8 % der
Runden bei belüfteten Scheiben, 19 % bei Scheiben und 75 % bei Trommeln, dort mit Spitzen bei
2,5-facher Kapazität und dem vollen Abschlag von 35 %. Der Zeitverlust bleibt trotzdem
bescheiden — im Mittel 0,01 %, im schlimmsten Fall 0,71 % (ein BMW 507 auf Trommeln in Sotschi,
1,4 s auf 194 s). Das ist ehrlich so: Bremsen kostet nur einen kleinen Teil der Runde, und die
Autos mit den schwachen Bremsen sind ohnehin die langsamen. Am heißesten wird es in Sotschi,
Madrid, Baku und Road America; auf den Ovalen und der Kreisbahn wird nie gebremst.

**Bremsen und Kurven.** Verzögerung aus der verbauten Bremse (belüftete Scheibe / Scheibe /
Trommel, vorn schwerer gewichtet). Kurventempo aus Radius, Gummi je Tonne und Antriebsart.
Ein Rückwärtslauf über die Strecke setzt daraus die Bremspunkte, ein Vorwärtslauf
beschleunigt dazwischen.

**Lastempfindlichkeit.** Grip steigt nicht im Takt mit der Last: doppelt so viel Gummi unter
dem Auto bringt deutlich weniger als doppelten Grip, weil der Reifen ohnehin schon walkt.
Statt einer Geraden mit harter Klemmung steht dort jetzt ein Potenzgesetz mit Exponent 0,4 —
und das ist die eigentliche Verbesserung, denn das Feld reicht von rund 300 mm Gummi je Tonne
bis 1.200, und die Gerade lag an **beiden** Enden auf der Klemmung fest. Jeder zusätzliche
Millimeter Lauffläche bringt jetzt ein bisschen weniger als der davor, und nirgends fällt
etwas ab.

Von den 0,4 sind etwa 0,15 echte Lastempfindlichkeit, wie sie in Reifendaten steht. Der Rest
steht stellvertretend für die Mischung: Ein Auto mit viel Gummi je Tonne fährt in der Praxis
auch die weichere Mischung, und dafür hat der Datensatz kein Feld. Die Kurvenspreizung des
Feldes bleibt damit dort, wo reale Querbeschleunigung liegt — bei R = 120 m von 107 bis
140 km/h.

**Rollwiderstand.** Nicht mehr eine Zahl für alle. Ein schmaler harter Sparreifen rollt bei
etwa 0,008, ein breiter weicher Sportreifen bei 0,015. Dieselbe Zahl, die den Grip bestimmt,
bestimmt also auch, was das Rollen kostet — genau der Handel, den ein echter Reifen macht.
Im Feld: Median 0,0110, Spanne 0,0093 bis 0,0148; Autos mit viel Gummi liegen bei 0,0122,
Autos mit wenig bei 0,0096.

**Kammscher Kreis.** Ein Reifen hat **ein** Reibungsbudget, nicht je eins pro Richtung. Was
schon fürs Einlenken draufgeht, fehlt zum Bremsen und Beschleunigen:

```
längs = √(1 − quer²)
```

Der Rückwärtslauf löst das mit, weil die Anfahrgeschwindigkeit davon abhängt, wie hart
gebremst werden kann, und das davon, wie schnell angekommen wird — zwei Durchgänge reichen.
Nach unten begrenzt auf 15 %: ein Fahrer hält einen Rest zurück, und ein Auto, das mitten in
einer Kurve kein einziges Newton mehr aufbringen darf, würde in einer langen Kurve
ausrollen.

Kostet im Median 0,07 % Rundenzeit, maximal 1,97 %, und genau dort am meisten, wo es soll:
Pikes Peak +0,55 %, Monaco und der enge Stadtkurs je +0,38 %, Lime Rock +0,30 %. Auf
Geraden und Tempotests exakt null. Dass es nicht mehr ist, liegt am Streckenmodell: Kurven
haben konstanten Radius und enden abrupt, also gibt es kaum Kurvenausgang, an dem der Kreis
greifen könnte.

**Zylinderzahl.** `Cylinders` steht für 99,96 % der Varianten da ("L4", "V8", "H6"). Ein
Dreizylinder zündet dreimal je zwei Umdrehungen und atmet durch drei kleine Kanäle, ein V12
zwölfmal durch zwölf — kleinere Druckstöße, weniger Ansaugung, die sich selbst im Weg steht,
und eine Drehmomentkurve, die über ein breiteres Band flacher liegt. Vier Zylinder sind die
Feldmitte und bewegen nichts; jede Verdopplung zieht die Kurve ein Drittel Richtung breit,
jede Halbierung ebenso weit in die andere Richtung.

Bewusst unabhängig von der Nenndrehzahl: Ein V8 und ein Vierzylinder mit Spitze bei
denselben 5.500/min sind nicht derselbe Motor, und bis hierher konnte das Modell sie
überhaupt nicht auseinanderhalten. Bei 30 % der Nenndrehzahl stehen jetzt 88 % Drehmoment
für einen Dreizylinder gegen 97 % für einen V8. Im Feld: 3.112 Vierzylinder, 1.134 Sechs-,
666 Acht-, 226 Drei-, 151 Zwölfzylinder.

**Steigung.** Reine Physik (`g · sin θ`).

**Luftdichte.** Jede Strecke bringt ihre eigene Höhe mit (Barometrische Höhenformel der
Standardatmosphäre). Dünne Luft ist zweierlei: weniger Widerstand zu schieben — reine
Physik — und weniger Sauerstoff zu verbrennen. Beim Motor ist die Sache nicht eindeutig,
ein Sauger verliert etwa proportional, ein Turbo dreht den Ladedruck hoch und holt das
meiste zurück. Der Datensatz sagt nicht, welcher Motor was ist: die Variantennamen nennen
Aufladung für knapp ein Fünftel des Feldes und übergehen 699 Diesel, die alle aufgeladen
sind. Also ein Exponent für alle (0,75, näher am Sauger, weil das Feld überwiegend einer
ist) statt einer Rateroutine je Auto. Elektroautos verlieren nichts.

Unterm Strich kostet Mexiko-Stadt (2.232 m, 80 % Luft) rund 2 % Rundenzeit, Kyalami
(1.753 m) 1,2 %; Baku liegt 25 m **unter** dem Meer und ist einen Hauch schneller. Ein
Elektroauto dreht das um und gewinnt in Mexiko-Stadt, weil es nur den Luftwiderstand
geschenkt bekommt.

**Überhöhung.** Auf einer geneigten Kurve trägt nicht mehr nur der Reifen die Querkraft,
sondern auch ein Teil des Eigengewichts:

```
v² = g · r · (μ · cos θ + sin θ) / (cos θ − μ · sin θ)
```

Nur die Ovale haben welche — Indianapolis mit den realen 9°12′, das selbst gebaute Trioval
mit 12°. Beide Runden fallen dadurch rund 6 % schneller aus. Die realen Rundkurse sind
flach, und die vermessenen Mittellinien führen ohnehin keine Querneigung.

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

## Rennen

Neben der einzelnen Runde gibt es den Modus **Rennen**: 250 km auf einem Rundkurs, auf ganze
Runden gerundet — 36 Runden Spa, 76 Runden Monaco, 199 Runden Kreisbahn. Bis zu 28 Autos,
wahlweise höchstens zwei je Marke, gezogen aus dem, was die Autofilter übrig lassen. Nur
geschlossene Runden stehen zur Wahl: ein Bergrennen und ein stehender Kilometer haben keine.

Dieser Modus ist der einzige mit Zufall und der einzige, in dem sich die Autos gegenseitig
sehen. Er ist bewusst vom Rundenzeitmodell getrennt — `src/lib/lap-race.ts` rechnet das
Rennen, `physics.ts` weiß davon nichts.

**Das Feld fährt gemeinsam.** Runde für Runde: erst die eigene Zeit jedes Autos, dann die
Reihenfolge nach der Uhr, dann von vorn nach hinten die Frage, ob jeder am Vordermann
vorbeikommt. Nur so kann ein Auto aufgehalten werden.

**Qualifying.** Eine Runde je Auto, jeder 0–3 % über seiner Bestzeit — deshalb ist die
Startaufstellung nicht einfach die Rangliste. Jeder Startplatz weiter hinten kostet 0,4 s,
bevor ein Rad sich dreht.

**Reifen.** Ein Satz hält **60–85 % des Rennens**; wie viel, entscheidet zu 70 % das Auto
(Gewicht je Millimeter Reifenbreite) und zu 30 % die Strecke (Kurvenanteil). Der Satz ist neu
1,5 % unter seinem Optimum, hat es nach **15 % seiner Lebensdauer** erreicht und baut danach
**quadratisch** ab — die erste Stinthälfte kostet fast nichts, die letzten Runden das meiste.
**Vorder- und Hinterachse verschleißen getrennt**: ein Fronttriebler frisst die Vorderreifen
(Faktor 1,35 zu 0,75), ein Hecktriebler die hinteren, Allrad verteilt es und kommt am
weitesten. Gewechselt wird immer komplett, also begrenzt die schlechtere Achse den Stint.

**Boxenstopps.** Kein Satz überlebt das Rennen, also stoppt jedes Auto — **immer ein- oder
zweimal, nie öfter**. Welche der beiden Strategien, rechnet die Box je Auto selbst aus: sie
vergleicht die Rundenverluste durch abbauende Reifen mit 25 s Boxenzeit plus der langsamen
Out-Lap und nimmt die billigere. Der Stopp fällt **±4 Runden** um den errechneten Zeitpunkt,
verschoben um die **Risikobereitschaft** des Autos (bis zu 3 Runden früher oder später). In
4 % der Fälle geht der Stopp schief und kostet 3–8 s extra. Ein Test rechnet beide Strategien
für echte Autos komplett nach und prüft, dass die gewählte tatsächlich die schnellere war.

**Die Runde selbst.** Erste Runde 2 % langsamer (alles kalt), Out-Lap 1,5 % langsamer, und
über das Rennen wird der Kurs 1,5 % schneller, weil Gummi liegen bleibt.

**Windschatten und Verkehr.** Innerhalb von 1,5 s hinter dem Vordermann fährt ein Auto in
dessen Loch: 25 % weniger Luftwiderstand, gewichtet mit dem Geradenanteil der Strecke — dafür
5 % weniger Grip in den Kurven. Vorbei kommt es nur mit einem **Tempoüberschuss über der
Schwelle der Strecke**, und die folgt der Geometrie: `0,4 % ÷ (längste Gerade / 800 m)`. Monza
verlangt 0,33 %, Monaco 1,64 %. Die nötige Marge wird jede Runde neu gewürfelt (60–140 % der
Schwelle), sonst wäre es Mechanik statt Rennen. Wer nicht vorbeikommt, hängt fest: er kann die
Runde nicht vor dem beenden, den er nicht überholt hat.

**Safety Car.** 0,8 % aller Fahrfehler enden in der Mauer. Dann drei Runden hinter dem Safety
Car im gleichen Tempo für alle, ein Stopp kostet dort nur die Hälfte, und am Ende steht das
Feld wieder bumper an bumper — alles, was jemand herausgefahren hatte, ist weg.

**Fahrfehler und Form.** Je Runde 0–2 % weniger Leistung, dazu eine Tagesform von 0–2 % fürs
ganze Rennen. Fehler kosten für eine Runde 10 % Grip; sie sind auf kurvenreichen Strecken und
mit schwächeren Bremsen wahrscheinlicher.

Wie viel ein Auto durch Grip-, Leistungs- oder Luftwiderstandsverlust verliert, ist nicht
geraten: für jedes Auto laufen vier Runden — sauber, 10 % weniger Grip, 10 % weniger Leistung,
25 % weniger Luftwiderstand — und dazwischen wird linear gelesen. Ein Bugatti verliert fast
nichts durch fehlende Leistung und viel durch fehlenden Grip, ein Dacia genau umgekehrt, und
ein Kastenwagen gewinnt im Windschatten mehr als ein Flunder.

Was daraus wird, ist streckenabhängig: In Monza hängt ein Auto in 29 % der Runden fest und die
Startaufstellung hält weitgehend; in Monaco sind es über 40 %, und dort kommt ein Auto auch mal
von Platz 11 auf Platz 4 — oder verliert von Platz 3 aus fünfzehn Ränge.

Rennergebnisse gehen **nicht** in die Ranglisten. Die versprechen eine saubere, wiederholbare
Runde; ein Rennen hat Glück und Verkehr darin. Zwei Tests halten das fest: keine Datei des
Rennmodus darf den Zeitspeicher auch nur erwähnen, und `physics.ts` darf nichts von Reifen,
Safety Car oder Zufall wissen.

## Wertungen filtern

Gesamtwertung und Streckenrekorde teilen sich dieselben Filter, damit „bester
frontgetriebener Diesel auf den Rundstrecken" auf beiden Tabellen dasselbe heißt.

**Nach Strecke.** Drei Gruppen, aus der Geometrie gelesen statt per Namensliste vergeben:
Sprints und Tempotests sind **Geradeaus**, ein Rundkurs ohne eine einzige Kurve unter 150 m
Radius ist ein **Oval** (Indianapolis, das Trioval, die Kreisbahn — überall dort wird nie
richtig gebremst), alles andere ist **Rundstrecke**. Angeboten werden die beiden Hälften,
die der Vergleich braucht: Geradeaus & Ovale gegen Rundstrecken. Die Aufteilung ist
lückenlos und überschneidungsfrei, was ein Test festhält.

**Nach Auto.** Klasse (die sechs kg/PS-Klassen aus der Garage), Antrieb und Kraftstoff —
alles Felder, die der Datensatz für jedes Auto führt. Die Filter greifen **vor** dem Bau der
Wertung, nicht danach: Punkte und Durchschnittsplatz sind Plätze in einem Feld, also muss
ein kleineres Feld sie ändern. Sonst stünde der „beste Diesel" mit Punkten da, die er hinter
inzwischen ausgeblendeten Benzinern geholt hat. Genauso bei den Rekorden: mit gewählter
Klasse ist die gezeigte Bestzeit die Klassenbestzeit, nicht der absolute Rekord mit
versteckter Konkurrenz.

Über der Rekordtabelle steht zusätzlich, **welche Marke wie viele Streckenrekorde hält** —
eine Marke mit einem unschlagbaren Auto ist etwas anderes als eine, die überall vorn ist,
und nur diese Tabelle trennt die beiden.

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
