# FitTrack — Trainingstagebuch

Eine Fitness-App für den Browser: Workouts protokollieren, Sätze abhaken, Fortschritt sehen.
Kein Konto, kein Server, keine Abhängigkeiten — reines HTML, CSS und JavaScript. Alle Daten
bleiben im `localStorage` des Geräts.

## Starten

```bash
# einfach die Datei öffnen …
open fitness-app/index.html

# … oder lokal ausliefern
npx http-server -p 8909 -s .
# → http://127.0.0.1:8909/fitness-app/index.html
```

Für einen ersten Eindruck: **Mehr → Beispieldaten laden** erzeugt zwölf Wochen Trainingsverlauf,
damit Diagramme und Auswertungen gefüllt sind.

## Funktionen

**Training aufzeichnen** — Einheit aus einem Plan oder frei starten. Übungen jederzeit ergänzen,
Sätze mit Gewicht und Wiederholungen eintragen und abhaken. Die Werte der letzten Einheit
erscheinen als Vorschlag, sodass man meist nur noch bestätigen muss. Beim Abhaken startet
automatisch der Pausentimer (Länge einstellbar, mit Signalton und „+30 s").

**Pläne** — sieben fertige Vorlagen (Ganzkörper, Push/Pull/Legs, Oberkörper/Unterkörper,
Ausdauer und Rumpf). Eigene Pläne lassen sich zusammenstellen, sortieren und bearbeiten;
Vorlagen kann man kopieren statt bei null anzufangen.

**Übungen** — 55 Übungen mit Muskelgruppe und Gerät, durchsuchbar und nach Muskelgruppe
filterbar. Eigene Übungen ergänzen, wahlweise als Kraft- (Gewicht × Wiederholungen) oder
Ausdauerübung (Minuten × Kilometer).

**Verlauf** — alle abgeschlossenen Einheiten nach Monaten gruppiert, mit Detailansicht je
Einheit: jeder Satz, Volumen pro Satz, Dauer und Notiz.

**Fortschritt** — Volumen je Woche über zwölf Wochen, Körpergewichtsverlauf, Bestenliste nach
geschätztem 1RM und pro Übung ein eigener Verlauf (1RM-Entwicklung und Volumen je Einheit).

**Daten** — Export und Import als JSON, Beispieldaten, vollständiges Löschen. Einheit wahlweise
kg oder lb, Wochenziel und Pausenlänge einstellbar, Design hell/dunkel/System.

Die App ist für das Handy gebaut (Bottom-Navigation, große Tippflächen) und wird ab Tablet-Breite
zum Seitenleisten-Layout.

## Rechenregeln

- **Volumen** = Summe aus Gewicht × Wiederholungen über alle abgehakten Sätze.
- **Geschätztes 1RM** nach Epley: `Gewicht × (1 + Wiederholungen ÷ 30)`.
- **Serie** = aufeinanderfolgende Tage mit Training, rückwärts ab heute. Ein noch trainingsfreier
  heutiger Tag beendet die Serie nicht.

## Aufbau

```
fitness-app/
├── index.html        Grundgerüst und Navigation
├── styles.css        Design-Tokens, Layout, Hell/Dunkel
├── js/data.js        Übungskatalog und Plan-Vorlagen
├── js/store.js       Zustand, localStorage, Auswertungen
├── js/charts.js      SVG-Diagramme ohne Bibliothek
├── js/app.js         Views, Routing, Interaktion
├── build-single-file.mjs   Bündelt alles zu einer HTML-Datei
└── tests/smoke.mjs   Browser-Test über 25 Abläufe
```

Klassische `<script>`-Einbindung statt ES-Modulen — so lässt sich `index.html` auch direkt per
Doppelklick öffnen, ohne dass CORS im Weg steht.

## Als einzelne Datei

```bash
node fitness-app/build-single-file.mjs          # → fittrack.html (alles inline)
node fitness-app/build-single-file.mjs --body   # ohne <html>/<head>/<body>, z. B. für Artifacts
```

Praktisch zum Verschicken oder Hosten: eine Datei, kein Server nötig. Läuft die App in einer
Umgebung, die eigene Downloads unterbindet, speichert der Export über die Host-Umgebung — sonst
über den normalen Download-Link.

## Tests

```bash
npx http-server -p 8909 -s .        # in einem zweiten Terminal
node fitness-app/tests/smoke.mjs    # benötigt playwright
```

Der Test fährt die echten Abläufe ab — Training starten, Sätze eintragen, Reload überstehen,
Einheit abschließen, Volumen nachrechnen, Pläne und Übungen anlegen, Export, Löschen — und
prüft nebenbei auf JavaScript-Fehler und horizontalen Überlauf bei 390 px Breite.
