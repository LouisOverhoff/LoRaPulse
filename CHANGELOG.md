# Changelog – LoRaPulse

Alle relevanten Architektur-, Funktions- und Dokumentationsänderungen an **LoRaPulse** werden hier chronologisch festgehalten.

---

## [0.0.1] – 2026-11-25 (Erster voll funktionsfähiger End-to-End-Release)
### Behoben & Gehärtet (TTN-MQTT-Praxis-Fix)
- Automatische Bereinigung von TTN-Eingabefeldern (`normalizeTtnTarget`): verhindert doppeltes `@ttn@ttn` (wenn `app-id@ttn` aus der TTN-Konsole kopiert wurde), bereinigt Großschreibung sowie mitkopierte `mqtts://`-, `https://`- oder `:8883`-Zusätze im Host-Feld.
- Getrenntes Abonnement von Lese-Topics (`/up`, `/join`) und Downlink-Topics inkl. expliziter `SUBACK 0x80`-Fehlerprüfung, damit reine Lese-API-Keys zuverlässig Uplinks empfangen und Berechtigungsfehler sofort sichtbar werden.
- Sofortige Geräte-Erkennung bereits beim ersten OTAA-`/join`-Event sowie automatisches Nachladen der letzten 24 Stunden aus der **TTN Storage Integration** direkt beim Verbinden.

### Hinzugefügt
- **Monorepo & Gemeinsame Verträge (`@lorapulse/shared`):** Typisierte Datenmodelle, Zod-Validierung, Fertig-Profile & binäre Fallback-Decoder für `Dragino DS03A-LB`, `Dragino D20-LB` und Wetterstationen, Li-SOCl₂-Batteriebewertung sowie Dragino-TDC-Downlink-Encoder (`FPort 2`).
- **Backend & Sicherheit (`@lorapulse/backend`):**
  - Dual-Driver PostgreSQL-Schicht (`pg` für PostgreSQL 16 + `@electric-sql/pglite` für lokalen Betrieb ohne Docker).
  - Geschlossenes Onboarding via `SETUP_TOKEN`, Argon2id-Passwort-Hashing, Einmal-Einladungslinks ohne SMTP-Zwang, `HttpOnly`/`SameSite=Strict`-Sessions und sofortiger Session-/SSE-Entzug bei Kontosperrung.
  - Hierarchische Kategorien, optionale Gruppen und Einzel-Sensor-Berechtigungen mit striktem *Zero-Sibling-Leak*-Schutz.
  - Multi-TTN-Application MQTT-Manager (`AES-256-GCM`-Schlüsselverschlüsselung, Auto-Discovery, `-999`-Sondenfehler-Filter, Alarm-Erzeugung, Echtzeit-SSE-Streaming, CSV/JSON-Export) sowie `SUPER_ADMIN`-exklusive Class-A-Downlink-Steuerung (`down/replace` + `down/sent`-Tracking).
- **PWA-Frontend (`@lorapulse/frontend`):** Zweisprachige (`DE`/`EN`) React-19-PWA komplett ohne Emojis (`lucide-react` Vektor-Icons, 4-stufige RSSI-Balken, Batterie-Grafik), Dark & Light Mode, echte Leaflet-Karte (`OpenStreetMap` / `OpenTopoMap`), Kategorie-/Sensor-Explorer, Zeitreihen-Diagramm, visueller JSON-Feld-Mapper und rollenbasierte Admin-Oberfläche.
- **TTN-v3-Simulator, Tests & Deployment:** Eigenständiger MQTT-Simulator (`@lorapulse/simulator`), automatisierte E2E- & RBAC-Testsuite (`backend/test/e2e.test.ts`), gehärtetes Multi-Stage-`Dockerfile`, `docker-compose.yml`, `docker-compose.traefik.yml`, `docker-compose.caddy.yml` und GitHub-Actions-Workflow (`.github/workflows/ci.yml`).

---

## [Unreleased] – 2026-11-24 bis 2026-11-25 (Konzept, Governance & Klick-Prototyp)
- Verbindliches Workspace-Regelwerk (`AGENTS.md`), `.gitignore`, Projektgedächtnis, ADRs (`ADR-001` bis `ADR-008`), UI-Sonderfall-Katalog und interaktiver UI-Klick-Prototyp erstellt.
