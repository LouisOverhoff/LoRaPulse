# Changelog – LoRaPulse

Alle relevanten Architektur-, Funktions- und Dokumentationsänderungen an **LoRaPulse** werden hier chronologisch festgehalten.

---

## [0.0.2] – 2026-11-26 (Web-Push, SMTP, Passwort-Reset, Ideen A–D & UI-Feinschliff)
### Hinzugefügt
- **Web-Push-Benachrichtigungen (Smartphone & Laptop):** Automatische VAPID-Schlüsselgenerierung (`AES-256-GCM`), Service Worker mit `push`- & `notificationclick`-Unterstützung (`frontend/src/sw.ts`), Multi-Geräte-Verwaltung je Benutzer, automatisches Bereinigen abgelaufener Abos (`HTTP 410`) und Test-Push.
- **SMTP-Mailserver & Passwort-Reset:** Konfigurierbare SMTP-Integration für `SUPER_ADMIN` inkl. Test-E-Mail, OWASP-konformer Passwort-Reset per 30-Minuten-Einmal-Link (*„Passwort vergessen?"* mit Session-Entzug nach Änderung) sowie optionaler E-Mail-Versand von Einladungslinks.
- **Pro-Nutzer & Pro-Sensor Benachrichtigungssteuerung:** Individuelle Schalter für jeden berechtigten Nutzer direkt am Sensor (**Standard: Push = Ein, E-Mail = Aus, Favorit = Aus**).
- **Zusatz-Funktionen A–D:**
  - *A – Aktiver Offline-Watchdog:* Automatische Erkennung und Meldung überfälliger Sensoren (> 3× erwartetes Sendeintervall).
  - *B – Automatische Alarm-Entwarnung (`RESOLVED`):* Automatisches Schließen offener Alarme bei Rückkehr in den Normalzustand.
  - *C – Wartungsmodus:* Pausieren von Alarmen & Benachrichtigungen pro Sensor für *1 Std. / 4 Std. / 24 Std.*
  - *D – Favoriten & Alarm-Sortierung:* Anpinnen von Favoriten-Sensoren per Stern-Icon und automatische Priorisierung auf der Übersicht.
- **Sensor-Profile löschen:** `DELETE /api/profiles/:id` für eigene Profile inkl. automatischem Fallback zugeordneter Sensoren auf `generic_json`.

### Geändert & Verbessert
- **Kompaktes Login- & Startseiten-Layout:** Vertikal zentrierte, zusammenhängende Login-/Setup-/Reset-Einheit ohne weite Leerflächen, dynamische Versionsanzeige (`v0.0.2`) mit klickbarem GitHub-Link sowie bündig gruppierte Messwerte auf den Sensorkacheln.
- **Live-tickende Zeitstempel:** Fortlaufende Aktualisierung von *„Zuletzt aktualisiert"* inkl. Uhrzeit ohne Neuladen der Seite.
- **100 % Sprachreinheit (`DE` / `EN`):** Vollständige Lokalisierung aller Rollen-, Status-, Batterie-, Alarm-, TTN- und Audit-Bezeichnungen ohne englische Restbegriffe in der deutschen Oberfläche (`0 Emojis`).

---

## [0.0.1] – 2026-11-25 (GitHub-Release & Produktives VPS-Deployment)
### Veröffentlicht & Bereitgestellt
- Öffentliches GitHub-Repository erstellt und Release-Tag `v0.0.1` gepusht (`https://github.com/LouisOverhoff/LoRaPulse`).
- Produktive Docker-Compose-Installation mit PostgreSQL 16 und Traefik-TLS-Overlay (`louis_netbird` / Let's Encrypt) auf dem Netcup-VPS unter `https://lorapulse.overhoff.it` in Betrieb genommen.

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
