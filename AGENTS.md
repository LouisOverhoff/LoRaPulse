# Verbindliche Projekt- & Arbeitsrichtlinien (AGENTS.md)

Diese Regeln gelten **dauerhaft und ausnahmslos** für den Hauptagenten sowie alle Subagenten in diesem Workspace (`LoRaWAN` Self-Hosted Multi-Sensor PWA).

---

## 1. Multi-Agent-Orchestrierung & Parallelisierung
- **Kontrollierte Parallelisierung:** Unabhängige Aufgaben (z. B. Backend-Modul, Frontend-Komponente, MQTT-Simulator, Dokumentation) werden gezielt parallel über Subagenten (`invoke_subagent`) oder Workflows (`run_workflow`) bearbeitet.
- **Abhängigkeits-Koordination (Contract-First):** Bevor Agenten parallel starten, müssen gemeinsame Schnittstellen (Datenbank-Schema, TypeScript-Typen, REST/SSE-Verträge) feststehen. Jeder Agent erhält klar abgegrenzte Dateibereiche (*File Ownership*), um Schreibkonflikte auszuschließen.

## 2. Dauerhaftes Projektgedächtnis & Ausfallsichere Checkpoints
- **Projektgedächtnis (`docs/memory/PROJECT_MEMORY.md`):** Enthält dauerhaftes Domänenwissen (LoRaWAN, Sensor-Besonderheiten, Architektur-Leitplanken). Vor größeren Änderungen lesen und bei neuen Erkenntnissen aktualisieren.
- **Checkpoints (`docs/CHECKPOINT.md`):** Nach jedem abgeschlossenen Arbeitspaket, Meilenstein oder vor längeren Pausen zwingend aktualisieren (Erledigt, In Arbeit, Offene Punkte, Nächster konkreter Schritt), sodass nach einem Neustart nahtlos fortgesetzt werden kann.
- **Entscheidungs- & Änderungsprotokoll:** Architekturentscheidungen werden mit Begründung und Alternativen in `docs/adr/DECISIONS.md` (ADR-Format) festgehalten; Code-/Systemänderungen in `CHANGELOG.md`.

## 3. Management-Kommunikation, Code-Reviews & Tool-Empfehlungen
- **Executive Summaries:** Am Ende jedes Meilensteins oder größeren Arbeitspakets eine prägnante Management-Zusammenfassung bereitstellen und `docs/EXECUTIVE_SUMMARY.md` pflegen (Ziel, Ergebnis, Sicherheits-/Performance-Status, Risiken, nächste Schritte).
- **Übersichtliche Änderungsprüfung:** Jede Code-Änderung transparent zusammenfassen (betroffene Dateien mit klickbaren Links, Zweck der Änderung, durchgeführte Prüfungen/Diffs).
- **Kontextabhängige Workflow-Empfehlungen:** Passende Slash-Commands (`/plan`, `/boost`, `/teamwork`, `/goal`, `/compact`, `/learn`) oder Spezial-Tools proaktiv empfehlen, sobald sie im aktuellen Schritt echten Mehrwert bringen.
- **Intelligente Entwicklungs-Erinnerungen:** Proaktiv an kritische Begleitschritte erinnern (z. B. DB-Migrationen, RBAC-Rechteprüfung auf neuen Endpunkten, `.env.example`-Pflege, OSM-Tile-Policy, Backup-Vorbereitung, LoRaWAN-Payload-Sonderfälle).

## 4. Lebende Dokumentation (Definition of Done)
Keine Funktion gilt als abgeschlossen, solange folgende Dokumente nicht synchron aktualisiert sind:
- **Technische Dokumentation (`docs/TECHNICAL_DOCS.md`):** Architektur, Datenbank, API-Endpunkte, MQTT-Datenfluss, Sicherheitsmechanismen und Server-Betrieb.
- **Endnutzer- & Admin-Dokumentation (`docs/USER_GUIDE.md`):** Verständliche Anleitung für Benutzer, Gruppen-/Kategorie-Admins und Super-Admins (inkl. iOS-PWA-Installation).
- **Visuelle Analyse:** Komplexe Abläufe, Abhängigkeiten und Fehlerbilder konsequent mit **Mermaid-Diagrammen** (Sequenz-, Status-, Fluss- und ER-Diagrammen) sichtbar machen.

## 5. Kritische UI-Sonderfälle & Striktes Emoji-Verbot (`docs/UI_EDGE_CASES.md`)
- **Keinerlei Emojis in der UI (Zero-Emoji-Policy):** In der gesamten Anwendungsoberfläche (Navigation, Kacheln, Statusmeldungen, Buttons, Karten-Pins, Toasts) werden **keine Emojis** verwendet. Stattdessen sind ausschließlich präzise monochrome Vektor-Icons (z. B. `lucide-react` SVG-Icons), technische Mikro-Visualisierungen (RSSI-Empfangsbalken, grafische Batterie-Füllstandsanzeige), Status-LED-Punkte, farbige Akzentkanten und klare typografische Badges einzusetzen.
- Bei jeder Frontend- und API-Entwicklung müssen alle in `docs/UI_EDGE_CASES.md` gelisteten Sonderfälle berücksichtigt und geprüft werden – insbesondere:
- Benutzer ohne Gruppe oder mit 0 sichtbaren Sensoren (saubere Leerzustände).
- Unkategorisierte Sensoren (`category_id = null`) und Einzel-Sensor-Freigaben ohne Daten-Leak benachbarter Kategorien/Sensoren.
- Sensoren ohne GPS-Koordinaten sowie Kartenansicht mit 0, 1 oder sehr vielen geclusterten Pins.
- iOS-PWA-Spezifika (Safari-Tab vs. Home-Screen-Modus, Safe-Area/Notch, Web-Push-Voraussetzung, Verbindungsabbruch/Offline im Gelände, abgelaufene Sitzung).

## 6. Realitätsnahe Integrationstests & Subsystem-Simulation
- Teilsysteme werden nicht nur isoliert, sondern über **realitätsnahe Simulatoren** getestet (insb. lokaler MQTT-Broker + TTN-v3-Uplink-Simulator für Dragino `DS03A-LB`, `D20-LB`, Wetterstationen, Verbindungsabbrüche, Duplikat-Pakete und Neustart-Gap-Recovery).
- Berechtigungslogik (RBAC: `SUPER_ADMIN`, `ADMIN`, `CATEGORY_ADMIN`, `OPERATOR`, `VIEWER`, Gruppen + Einzelrechte) wird automatisiert gegen unbefugten Zugriff (IDOR / Privilege Escalation) getestet.

## 7. Strikter Schutz sensibler Zugangsdaten (Zero-Secret-Leak)
- **Niemals** echte Passwörter, Session-Secrets, Master-Keys, TTN-API-Keys oder private Sensor-Schlüssel (`AppKey`) in Quellcode, Git, Dokumentationen, Logs oder Beispiel-Payloads schreiben.
- In Konfigurationsvorlagen (`.env.example`) und Tests ausschließlich klar erkennbare Platzhalter verwenden.
- Sensible Drittschlüssel (z. B. TTN-API-Keys) in der Datenbank immer mit **AES-256-GCM** verschlüsseln und in API-Antworten/Logs maskieren; Passwörter ausschließlich mit **Argon2id** hashen.
