# Technische Dokumentation – LoRaPulse (`v0.0.2`)

---

## 1. Architektur-Überblick

LoRaPulse ist als modulares TypeScript-Monorepo aufgebaut:
- `packages/shared`: Gemeinsame Typen (`v0.0.2`), Zod-Schemas, lokalisierte Standard-Sensorprofile (`Dragino DS03A-LB`, `Dragino D20-LB`, `Wetterstation`, `Generischer Sensor`), Li-SOCl₂-Batteriebewertung, binäre Fallback-Decoder und TDC-Downlink-Encoder.
- `backend`: Fastify-Server, Dual-Driver PostgreSQL (`pg.Pool` + `@electric-sql/pglite`), `Argon2id`-Auth, `AES-256-GCM`-Schlüsselspeicher, `TtnMqttManager`, `NotificationDispatcher` (`web-push` VAPID + `nodemailer` SMTP), `OfflineWatchdog` und berechtigungsgefilterter SSE-Live-Hub.
- `frontend`: React 19 + Vite PWA (`injectManifest` Service Worker `src/sw.ts`, opake PNG-/ICO-Icons für iOS Safari & Manifest, nicht-transparenter iOS-Header, umschaltbare **Standard/Kompakt**-Ansicht) + Tailwind CSS v4 + `lucide-react` (strikte Zero-Emoji-Policy) + Leaflet (**OpenStreetMap**) + 100 % sprachreine `DE`/`EN`-Lokalisierung + Live-Zeitstempel-Ticker (`useNowTick`).
- `simulator`: Eigenständiger TTN-v3-kompatibler MQTT-Broker (`aedes`) inkl. Class-A-RX1-Downlink-Simulation.

---

## 2. Datenbank-Schema (`v0.0.2`)

Alle Tabellen und Spalten-Migrationen werden beim Serverstart idempotent ausgeführt (`backend/src/db/schema.ts`):
- `users`, `sessions`, `invite_tokens`, `password_reset_tokens` (SHA-256-gehashte Tokens, 30 Min. Gültigkeit)
- `user_groups`, `user_group_members`, `categories`, `permissions`
- `ttn_applications`, `sensor_profiles`
- `devices` (inkl. `latest_values_json` Hot-Cache, `probe_error_fields_json`, `pending_downlink_json`, `maintenance_until`)
- `user_device_preferences` (`PRIMARY KEY (user_id, device_id)`, Systemstandard: `push_enabled = TRUE`, `email_enabled = FALSE`, `is_favorite = FALSE`)
- `push_subscriptions` (`1..n` Endgeräte wie Smartphone + Laptop pro Benutzer)
- `system_kv` (`vapid_keys` automatisch generiert & verschlüsselt; `smtp_settings` mit verschlüsseltem SMTP-Passwort)
- `measurements`, `alerts` (`OPEN | ACKED | RESOLVED`, inkl. `resolved_at`), `audit_logs`

---

## 3. Neue REST-Schnittstellen in `v0.0.2`

Zusätzlich zu allen `v0.0.1`-Routen:
- `POST /api/auth/password-reset/request` & `GET /api/auth/password-reset/:token` & `POST /api/auth/password-reset/confirm`
- `GET /api/push/subscriptions`, `POST /api/push/subscriptions`, `DELETE /api/push/subscriptions/:id`, `POST /api/push/test`
- `PUT /api/devices/:id/preferences` – Speichert Favorit, Push- und E-Mail-Wahl des eingeloggten Nutzers für diesen Sensor
- `POST /api/devices/:id/maintenance` – Aktiviert/beendet den Wartungsmodus (`OPERATOR`+)
- `DELETE /api/profiles/:id` – Löscht benutzerdefinierte Sensor-Profile und stellt zugeordnete Geräte sicher auf `generic_json` um (`ADMIN`+)
- `GET /api/super/smtp`, `PUT /api/super/smtp`, `POST /api/super/smtp/test` – SMTP-Mailserver-Konfiguration (`SUPER_ADMIN`)
