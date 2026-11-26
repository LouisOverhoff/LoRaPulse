# Architecture Decision Records (ADR)

Chronologisches Verzeichnis aller wichtigen Architektur- und Designentscheidungen für **LoRaPulse**.

---

## ADR-001: Eigenes Backend mit Multi-App-MQTT statt direkter Browser-Verbindung
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Ein dauerhaft laufender Backend-Service hält je TTN-Application eine TLS-gesicherte MQTT-Verbindung offen, normalisiert die Payloads und speichert sie in PostgreSQL. Die PWA spricht ausschließlich per HTTPS/SSE mit dem Backend.
- **Begründung:** Schutz der TTN-API-Keys, 24/7-Datenerfassung, zentrale Regel-/Offline-Überwachung und serverseitige Rechtefilterung.

## ADR-002: PostgreSQL mit `ltree`, `JSONB` und Partitionierung als einzige Datenbank
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Einsatz von PostgreSQL 16 mit `ltree` (GiST-indizierte Kategorie-Pfade), `devices.latest_state` (`JSONB` Hot-Cache für <5-ms-Dashboards/Karten) und monatlich partitionierter `measurements`-Tabelle.
- **Verworfene Alternative:** Separate Zeitreihen-DB parallel zu Postgres (höherer Ressourcenbedarf & komplexe Rechtefilterung).

## ADR-003: Einheitliches Berechtigungsmodell für Kategorien & Einzelsensoren
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Einheitliche `permissions`-Struktur (`user_id XOR group_id` → `category_id XOR device_id`) mit effektiver Maximal-Rechteauflösung (`MAX(level)`).

## ADR-004: Self-Hosting mit Container-Härtung, Admin-Only-Onboarding & optionalem Socket-Reboot
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Kein öffentlicher Sign-Up; erster `SUPER_ADMIN` über `SETUP_TOKEN`; weitere Konten nur durch Admins per Einmal-Link. Argon2id + AES-256-GCM + `HttpOnly/Secure/SameSite=Strict`-Sessions. Unprivilegierte Read-Only-Container; optionales Host-Reboot-Modul (`ENABLE_HOST_REBOOT`).

## ADR-005: OpenStreetMap (Leaflet) für nutzerbezogene Sensor-Karten
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Leaflet mit OpenStreetMap (+ optional OpenTopoMap) unter Einhaltung der OSM Tile Usage Policy.

## ADR-006: Reverse-Proxy-neutraler Single-Entrypoint mit Docker-Compose-Overlays
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Auslieferung von statischer PWA, `/api/*` und SSE über einen einzigen internen Port (`8080`), ergänzt um `docker-compose.traefik.yml` und `docker-compose.caddy.yml`.

## ADR-007: Projektidentität `LoRaPulse`, MIT-Lizenz & Zweisprachigkeit (`DE`/`EN`)
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Entscheidung:** Veröffentlichung unter dem Namen **LoRaPulse** mit **MIT-Lizenz** und typisierter `de`/`en`-Internationalisierung ab der ersten Zeile Code.
- **Begründung:** Maximale Nutzbarkeit für die Open-Source-/Self-Hosting-Community ohne späteren Refactoring-Aufwand für Sprachdateien.

## ADR-008: Zweistufiges Sensor-Profil-System & `SUPER_ADMIN`-Exklusivität für Downlinks
- **Datum:** 2026-11-24 | **Status:** Beschlossen
- **Kontext:** Beliebige Sensoren sollen einfach eingebunden werden, und das Sendeintervall soll per LoRaWAN-Downlink anpassbar sein, ohne Batterie oder TTN Fair Use Policy durch Fehlbedienung zu gefährden.
- **Entscheidung:**
  1. Kombination aus geprüften Fertig-Profilen (`DS03A-LB`, `D20-LB`, Wetterstation) und einem visuellen Live-Payload-JSON-Mapper mit Echtzeit-Kachelvorschau und Ausreißer-Filterung.
  2. LoRaWAN-Downlinks (über MQTT `.../down/replace` mit Status-Tracking für Class-A-Geräte) sind strikt der Rolle `SUPER_ADMIN` vorbehalten, geschützt durch Mindestintervall-Validierung und Audit-Log.

## ADR-009: Multi-Device VAPID Web-Push, SMTP-Passwort-Reset & Pro-Sensor-Benachrichtigungspräferenzen (`v0.0.2`)
- **Datum:** 2026-11-26 | **Status:** Beschlossen
- **Kontext:** Nutzer möchten Hintergrund-Push-Mitteilungen parallel auf Smartphone und Laptop empfangen, einen eigenen SMTP-Mailserver für eigenständigen Passwort-Reset und optionale Alarm-E-Mails anbinden sowie pro Sensor individuell steuern, wie sie benachrichtigt werden.
- **Entscheidung:**
  1. Automatische serverseitige Generierung und `AES-256-GCM`-Speicherung eines eigenen VAPID-Schlüsselpaars (`system_kv`) sowie `1..n` `push_subscriptions` je Benutzer mit automatischer Bereinigung abgelaufener Browser-Abos (`HTTP 404/410`).
  2. Zentrale SMTP-Konfiguration durch `SUPER_ADMIN` (`AES-256-GCM`-verschlüsselt) mit OWASP-konformem 30-Minuten-Einmal-Token für Passwort-Resets (neutraler Rückgabestatus gegen Account-Enumeration + Invalidierung alter Sessions nach Reset).
  3. Tabelle `user_device_preferences` mit verbindlichem Systemstandard **`pushEnabled = true, emailEnabled = false, isFavorite = false`** je `(user_id, device_id)`.
  4. Ergänzung um aktiven `OfflineWatchdog` (> 3× erwartetes Meldeintervall), automatische Alarm-Entwarnung (`RESOLVED`) und temporären Sensor-Wartungsmodus (`maintenance_until`).
