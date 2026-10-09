# Arena Forge

Arena Forge ist ein lokaler First-Person-Arena-Shooter mit prozedural erzeugten Karten, taktischer Gegner-KI, Loot, Inventar und vollständigen Spielrunden. Einstellungen und der lokale Rekord werden im Browser gespeichert.

## Start

```powershell
npm ci
npm start
```

Danach `http://127.0.0.1:4185/` öffnen.

## Spielmodi

- **Eliminierung:** Sichere die Arena innerhalb von sieben Minuten. Der Spieler hat drei Leben.
- **Überleben:** Fünf zunehmend größere Gegnerwellen mit einer Versorgungsphase zwischen den Wellen.
- Schwierigkeit, Kartengröße, Gegnerzahl, Bereichszahl und Architektur sind einstellbar.
- Ein Map-Seed erzeugt jederzeit dieselbe Karte erneut.

## Steuerung

- **WASD:** bewegen · **Shift:** sprinten · **Leertaste:** springen
- **Strg/C:** Ausweichschritt
- **Linksklick:** schießen oder Nahkampfangriff; automatische Waffen können gehalten werden
- **Rechtsklick:** zielen, Verbrauchsgegenstand benutzen oder Möbel platzieren
- **E:** Türen, Kisten und Gegenstände benutzen
- **R:** Magazin nachladen
- **1–9 / Mausrad:** Hotbar auswählen
- **I:** Inventar und Sandbox-Katalog · **P:** Pause · **F:** Vollbild

## Spielsysteme

- 11 Spielerwaffen mit eigenem Schaden, Reichweite, Streuung, Feuerrate, Rückstoß, Magazin und Reservemunition
- Projektilflug, Pfeile, Einschusslöcher, Kopftreffer, Schadensabfall und Schrotflinten-Pellets
- Heilung, Panzerplatten, Adrenalin, Munitionspakete, Splitter- und Rauchgranaten
- Waffen-, Medizin- und Versorgungskisten mit mehreren Gegenständen
- Gegner mit Sicht, Gehör, Reaktionszeit, Erinnerung, Wegfindung, Ausweichen, Rückzug, Sprüngen und Türenbenutzung
- Rauch unterbricht Sichtlinien; Wände und geschlossene Türen verhindern Wahrnehmung und Beschuss
- Minimap, Trefferanzeige, Killfeed, Gesundheit, Rüstung, Ausdauer, Munition, Punkte, Leben und lokaler Rekord
- Pause, Neustart derselben Karte, nächste Arena sowie FOV-, Maus- und Audioeinstellungen

## Karten

Der Generator enthält neun eigenständige Architekturen: offene Arena, Raumkomplex, Lagerhalle, drei Wege, Hofanlage, Kreuzung, Schleusenlabyrinth, Außenposten und Containerdepot. Karten besitzen mehrere Laufwege, Deckung, sichere Startbereiche, Lootpunkte und thematisch passende Möbel.

## Entwicklung

```powershell
npm test
npm run test:e2e
npm run build
```

Die Tests prüfen Kampf- und Rundenregeln, reproduzierbare Maps, Erreichbarkeit, Möbelgeometrie, Navigation, Sichtlinien, Rauch, Inventar, Bogen, mobile Darstellung und eine schwere Arena mit 24 Gegnern.

## Projektstruktur

- `js/scene.js` – Three.js-Szene, Spieler, Kampf, Effekte, Loot und Integration
- `js/enemy-ai.js` – Wahrnehmung, Entscheidungen und Navigation der Gegner
- `js/combat.js` – Waffen, Gegenstände, Magazine und Schadensregeln
- `js/match.js` – Spielrunde, Wellen, Punkte, Leben und Ergebnisse
- `js/random-map.js` – Seed-basierte Arena-Layouts und Spawnpunkte
- `js/arena-parser.js`, `js/arena-geometry.js` – interne Arena-Geometrie
- `js/furniture.js` – optimierte Möbel und taktische Deckung
- `js/game-constants.js` – Bewegungs- und Geometriekonstanten
- `js/app.js`, `index.html`, `style.css` – Oberfläche, HUD, Inventar und Menüs
- `test/` – Unit-, Navigations-, Karten- und Browser-Tests
