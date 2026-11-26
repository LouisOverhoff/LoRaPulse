# Katalog kritischer UI- & UX-Sonderfälle (UI Edge Cases)

Diese Checkliste wird in **LoRaPulse** bei jeder Frontend- und API-Änderung geprüft, um Darstellungsfehler, Abstürze und Sicherheitslücken (Informations-Leaks) dauerhaft zu verhindern.

---

## 1. Berechtigungen, Gruppen & Kategorien
- **Nutzer ohne Gruppe & ohne Berechtigung (0 Sensoren):** Freundlicher Leerzustand (*DE/EN*) statt leerer Tabellen oder Ladefehler.
- **Unkategorisierte Sensoren (`category_id = NULL`):** Eigene Sektion *„Ohne Kategorie / Uncategorized"*, identische Funktion auf Dashboard, Detailseite und Karte.
- **Einzel-Sensor-Freigabe innerhalb einer fremden Kategorie:** Kein Leak benachbarter Sensoren oder Ordnernamen (*Zero Sibling Leak*); Anzeige unter *„Direkt freigegeben / Shared directly"*.
- **Live-Entzug von Rechten / Kontosperrung:** Offene SSE-Streams werden serverseitig sofort getrennt; saubere Weiterleitung auf Login bzw. Live-Bereinigung der Ansicht.

## 2. OpenStreetMap-Kartenansicht
- **0 Sensoren mit Koordinaten:** Kein Absturz bei `fitBounds([])`; Standard-Kartenausschnitt mit Hinweis.
- **Genau 1 Sensor mit Koordinaten:** Sinnvolle Begrenzung des Auto-Zooms (`maxZoom: 15`).
- **Mischung aus Sensoren mit und ohne GPS:** Dezenter Hinweis-Badge (*„X weitere Sensoren ohne Standort"*), damit keine Sensoren übersehen werden.
- **Identische Koordinaten (mehrere Sensoren am selben Mast/Gebäude):** Clustering / Spiderfying verhindert verdeckte Pins.

## 3. Sensordaten, JSON-Mapper & LoRaWAN-Downlinks
- **Neuer Sensor ohne ersten Messwert (`latest_state = null`):** Anzeige *„Warte auf erstes Datenpaket…"* statt `NaN` oder `01.01.1970`; JSON-Mapper weist sauber darauf hin, dass für den Live-Baum mindestens ein Uplink empfangen (oder ein Beispiel-JSON eingefügt) werden muss.
- **Fehlende / geänderte Felder im Payload:** Sendet ein Sensor in einem Status-Paket nur Teilfelder (z. B. ohne Temperatur), crasht der JSON-Mapper nicht, sondern behält bekannte Teilwerte getrennt vom Zeitstempel nachvollziehbar bei.
- **Überfälliger / Offline-Sensor:** Veraltete Messwerte werden optisch klar als veraltet gekennzeichnet.
- **Ausreißer / Sondenfehler:** Hardware-Fehlercodes (z. B. `-999` oder `327.67 °C`) werden über die Profil-Gültigkeitsgrenzen als *„Sondenfehler"* markiert, ohne die Diagramm-Skalierung zu zerstören.
- **Class-A Downlink-Verzögerung (`SUPER_ADMIN`):** Da Batterie-Sensoren Downlinks erst nach dem nächsten Uplink empfangen, zeigt die UI klar *„Wartet auf nächsten Sensor-Uplink"* an (kein irreführendes „Sofort geändert!") und meldet verständlich, falls dem TTN-API-Key Schreibrechte (*Write downlink traffic*) fehlen.

## 4. Visuelle Konsistenz, Mehrsprachigkeit (`DE`/`EN`) & Mobile / iOS PWA
- **Striktes Emoji-Verbot (Zero-Emoji-UI):** Emojis rendern auf Windows, iOS und Android inkonsistent und wirken unruhig. Alle Zustände müssen durch einheitliche SVG-Icons (`stroke-width: 1.75–2`), Signal-/Batterie-Grafiken, Status-LEDs und klare Typografie dargestellt werden.
- **Textlängen Deutsch vs. Englisch:** Deutsche Begriffe (z. B. *„Sendeintervall aktualisieren"*) sind oft ~30 % länger als englische – Buttons und Badges müssen auf 320px-Screens ohne Überlappung umbrechen oder kürzen.
- **iOS Safari-Tab vs. Installierte PWA:** Vorab-Prüfung auf `standalone`-Modus vor Aktivierung von Web-Push, opake PNG-Icons (`apple-touch-icon.png` 180×180, `icon-192.png`, `icon-512.png`, `favicon-32x32.png`, `favicon.ico`) statt iOS-ignorierter SVGs, sowie solide nicht-geblurte Statusleiste (`black`/`default` + synchronisiertes `theme-color` statt `black-translucent`).
- **Safe-Area-Insets (iPhone Dynamic Island / Home-Bar):** Berücksichtigung von `env(safe-area-inset-*)` in `.lp-header-bar`, Navigation und Vollbild-Karte.
- **Schlechter Mobilfunk im Außeneinsatz:** Klare Fehler-/Offline-Anzeige und Schutz vor Doppel-Aktionen (Loading-Lock).
